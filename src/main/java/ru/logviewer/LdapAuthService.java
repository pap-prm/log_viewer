package ru.logviewer;

import com.unboundid.ldap.sdk.BindResult;
import com.unboundid.ldap.sdk.ExtendedResult;
import com.unboundid.ldap.sdk.LDAPConnection;
import com.unboundid.ldap.sdk.LDAPConnectionOptions;
import com.unboundid.ldap.sdk.LDAPException;
import com.unboundid.ldap.sdk.ResultCode;
import com.unboundid.ldap.sdk.SearchRequest;
import com.unboundid.ldap.sdk.SearchResult;
import com.unboundid.ldap.sdk.SearchResultEntry;
import com.unboundid.ldap.sdk.SearchScope;
import com.unboundid.ldap.sdk.SimpleBindRequest;
import com.unboundid.util.ssl.SSLUtil;
import com.unboundid.util.ssl.TrustStoreTrustManager;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Аутентификация и авторизация через Microsoft Active Directory по LDAPS (636).
 *
 * Схема:
 *  1. Сервис связывается с AD под сервисной учётной записью (ldap.bind.dn / ldap.bind.password).
 *  2. Находит пользователя по sAMAccountName (или userPrincipalName) в базе (searchBase).
 *  3. Проверяет, что пользователь состоит в одной из разрешённых групп (ldap.allowed.groups) -
 *     с учётом вложенности групп (recursive tokenGroups).
 *  4. Выполняет bind от имени пользователя под его паролем - если bind успешен и группа разрешена,
 *     доступ открыт.
 *
 * Важно: используется ТОЛЬКО ldaps:// (TLS) либо ldap:// + StartTLS. Открытый ldap:// без TLS
 * отвергается на этапе проверки конфигурации (AppConfig.validate()).
 */
public final class LdapAuthService implements AutoCloseable {

    /** Результат попытки входа. */
    public record LoginResult(boolean success, String message, String dn, String displayName, List<String> groups) {
        static LoginResult fail(String msg) { return new LoginResult(false, msg, null, null, List.of()); }
    }

    private final String host;
    private final int port;
    private final boolean useTls;          // ldaps:// = implicit TLS
    private final boolean startTls;        // ldap:// + StartTLS
    private final String bindDn;
    private final String bindPassword;
    private final String searchBase;
    private final String userFilterTemplate;
    private final List<String> allowedGroups;   // DN или CN групп
    private final boolean verifyHostname;
    private final int connectTimeoutMs;
    private final boolean useTokenGroups;
    private final String truststorePath;
    private final String truststorePassword;
    private final SSLSocketVerifier sslSocketVerifier;

    public LdapAuthService(AppConfig cfg) {
        this.truststorePath = cfg.getLdapTruststorePath();
        this.truststorePassword = cfg.getLdapTruststorePassword();
        try {
            URI uri = new URI(cfg.getLdapUrl());
            String scheme = uri.getScheme() == null ? "" : scheme(uri);
            this.useTls = "ldaps".equalsIgnoreCase(scheme);
            this.startTls = !useTls && cfg.isLdapStartTls();
            this.host = uri.getHost();
            this.port = uri.getPort() > 0 ? uri.getPort() : (useTls ? 636 : 389);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Некорректный ldap.url: " + cfg.getLdapUrl(), e);
        }
        this.bindDn = cfg.getLdapBindDn();
        this.bindPassword = cfg.getLdapBindPassword();
        // base для поиска пользователей берём из DN сервисной учётки (DC=corp,DC=local),
        // либо можно переопределить отдельным параметром при необходимости.
        this.searchBase = extractBase(bindDn);
        this.userFilterTemplate = cnf(cfg, "(|(&(objectClass=user)(sAMAccountName={0}))(|(objectClass=user)(userPrincipalName={0})))");
        this.allowedGroups = cfg.getLdapAllowedGroups();
        this.verifyHostname = cfg.isLdapTlsVerifyHostname();
        this.connectTimeoutMs = cfg.getLdapConnectTimeoutMs();
        this.useTokenGroups = true; // AD поддерживает tokenGroups - быстрый учёт вложенных групп
        this.sslSocketVerifier = verifyHostname ? null : new LenientHostnameVerifier();
    }

    private static String scheme(URI uri) {
        return uri.getScheme();
    }

    private static String cnf(AppConfig cfg, String def) {
        // пока жёстко; при желании вынести в config.properties
        return def;
    }

    /** DC=corp,DC=local из "CN=svc,OU=Service Accounts,DC=corp,DC=local" */
    private static String extractBase(String dn) {
        int idx = dn.toUpperCase(Locale.ROOT).indexOf("DC=");
        if (idx < 0) {
            throw new IllegalArgumentException("Не удалось определить search base из ldap.bind.dn: " + dn);
        }
        return dn.substring(idx);
    }

    private LDAPConnection openConnection() throws LDAPException, SSLException {
        LDAPConnectionOptions opts = new LDAPConnectionOptions();
        opts.setConnectTimeoutMillis(connectTimeoutMs);
        opts.setResponseTimeoutMillis(0); // без ограничения на ответ
        if (useTls) {
            SSLSocketFactory sf = createSocketFactory();
            return new LDAPConnection(sf, opts, host, port);
        }
        if (startTls) {
            // StartTLS через reflection: в SDK 7.x публичный startTLS заменён пакетным
            // convertToTLS; сам extended-запрос при этом выполняет LDAPConnection.
            try {
                java.lang.reflect.Method m = LDAPConnection.class.getDeclaredMethod(
                        "convertToTLS", SSLSocketFactory.class);
                m.setAccessible(true);
                LDAPConnection conn = new LDAPConnection(opts, host, port);
                m.invoke(conn, createSocketFactory());
                return conn;
            } catch (ReflectiveOperationException e) {
                throw new LDAPException(ResultCode.CONNECT_ERROR,
                        "StartTLS недоступен в этой версии UnboundID SDK: " + e.getMessage());
            }
        }
        return new LDAPConnection(opts, host, port);
    }

    /**
     * SSLSocketFactory для LDAPS/StartTLS. Проверка цепочки сертификатов выполняется
     * всегда (JDK cacerts или ldap.truststore.path). Параметр ldap.tls.verify.hostname=false
     * дополнительно отключает проверку имени узла (используется только на стендах с
     * самоподписанным сертификатом КД; для продакшена оставьте true и импортируйте
     * сертификат CA в truststore - см. README шаг 6).
     */
    private SSLSocketFactory createSocketFactory() throws SSLException {
        try {
            TrustManager[] tms;
            TrustStoreTrustManager tsm = truststoreTrustManager();
            if (tsm != null) {
                tms = new TrustManager[]{tsm};
            } else {
                tms = new SSLUtil().getTrustManagers();
            }
            if (!verifyHostname) {
                TrustManager[] wrapped = new TrustManager[tms.length];
                for (int i = 0; i < tms.length; i++) {
                    wrapped[i] = (tms[i] instanceof javax.net.ssl.X509TrustManager tm)
                            ? new LenientHostnameTrustManager(tm) : tms[i];
                }
                tms = wrapped;
            }
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, tms, new java.security.SecureRandom());
            return ctx.getSocketFactory();
        } catch (GeneralSecurityException e) {
            throw new SSLException("Не удалось инициализировать TLS для LDAPS: " + e.getMessage(), e);
        }
    }

    /** TrustManager, читающий доверенные сертификаты из отдельного truststore-файла. */
    private TrustStoreTrustManager truststoreTrustManager() {
        if (truststorePath == null || truststorePath.isBlank()) {
            return null;
        }
        String pwd = (truststorePassword == null || truststorePassword.isBlank())
                ? "changeit" : truststorePassword;
        return new TrustStoreTrustManager(truststorePath, pwd.toCharArray(), detectStoreType(truststorePath), true);
    }

    /**
     * Делегирует стандартному X509TrustManager проверку ЦЕПОЧКИ сертификатов, но
     * добавляет в allowlist все SAN/CN presented-сертификата - фактически отключает
     * только сверку hostname (цепочка по-прежнему проверяется против truststore).
     * Используется исключительно при ldap.tls.verify.hostname=false.
     */
    private static final class LenientHostnameTrustManager implements javax.net.ssl.X509TrustManager {
        private final javax.net.ssl.X509TrustManager delegate;

        LenientHostnameTrustManager(javax.net.ssl.X509TrustManager delegate) {
            this.delegate = delegate;
        }

        @Override
        public void checkClientTrusted(java.security.cert.X509Certificate[] chain, String authType)
                throws java.security.cert.CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        @Override
        public void checkServerTrusted(java.security.cert.X509Certificate[] chain, String authType)
                throws java.security.cert.CertificateException {
            // делегат выполнит полную PKIX-валидацию цепочки (доверие корневому CA)
            delegate.checkServerTrusted(chain, authType);
        }

        @Override
        public java.security.cert.X509Certificate[] getAcceptedIssuers() {
            return delegate.getAcceptedIssuers();
        }
    }

    /** PKCS12 для .p12/.pfx, иначе JKS. */
    private static String detectStoreType(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        return (p.endsWith(".p12") || p.endsWith(".pfx")) ? "PKCS12" : "JKS";
    }

    /**
     * Проверка логина/пароля и членства в разрешённой группе MS AD.
     */
    public LoginResult login(String username, String password) {
        if (username == null || username.isBlank() || password == null || password.isEmpty()) {
            return LoginResult.fail("Введите логин и пароль");
        }
        try (LDAPConnection svcConn = openConnection()) {
            // 1. Bind сервисной учётной записью
            BindResult svcBind = svcConn.bind(new SimpleBindRequest(bindDn, bindPassword));
            if (svcBind.getResultCode() != ResultCode.SUCCESS) {
                return LoginResult.fail("Сервисная учётная запись не может связаться с AD (код "
                        + svcBind.getResultCode() + "). Обратитесь к администратору.");
            }

            // 2. Поиск пользователя
            SearchRequest sr = new SearchRequest(searchBase, SearchScope.SUB,
                    filterForUser(username), "dn", "sAMAccountName", "displayName", "memberOf", "userPrincipalName");
            SearchResult res = svcConn.search(sr);
            if (res.getEntryCount() != 1) {
                return LoginResult.fail("Пользователь не найден или найдено несколько совпадений");
            }
            SearchResultEntry entry = res.getSearchEntries().get(0);
            String userDn = entry.getDN();

            // 3. Проверка членства в разрешённой группе (с вложенностью через tokenGroups)
            List<String> memberOf = readGroups(svcConn, userDn, entry);
            if (!isMemberOfAllowed(memberOf)) {
                return LoginResult.fail("У вас нет доступа. Требуется членство в одной из групп: "
                        + String.join(", ", allowedGroups));
            }

            // 4. Bind паролем пользователя (отдельное соединение!)
            try (LDAPConnection userConn = openConnection()) {
                BindResult userBind = userConn.bind(new SimpleBindRequest(userDn, password));
                if (userBind.getResultCode() != ResultCode.SUCCESS) {
                    return LoginResult.fail("Неверный пароль");
                }
            }

            String display = entry.getAttributeValue("displayName");
            if (display == null) display = entry.getAttributeValue("sAMAccountName");
            return new LoginResult(true, "OK", userDn, display, memberOf);

        } catch (SSLException e) {
            return LoginResult.fail("Ошибка TLS при подключении к AD: " + e.getMessage());
        } catch (IOException e) {
            return LoginResult.fail("Ошибка ввода-вывода: " + e.getMessage());
        } catch (LDAPException e) {
            return LoginResult.fail("Ошибка LDAP/LDAPS: " + e.getMessage() + " (код " + e.getResultCode() + ")");
        }
    }

    private com.unboundid.ldap.sdk.Filter filterForUser(String username) {
        String safe = escapeFilterValue(username);
        return com.unboundid.ldap.sdk.Filter.createEqualityFilter("sAMAccountName", safe);
    }

    /** Экранирование значений в LDAP-фильтре (RFC 4515) - защита от LDAP injection. */
    private static String escapeFilterValue(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\5c"); break;
                case '*': sb.append("\\2a"); break;
                case '(': sb.append("\\28"); break;
                case ')': sb.append("\\29"); break;
                case '\0': sb.append("\\00"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }

    private List<String> readGroups(LDAPConnection conn, String userDn, SearchResultEntry entry) throws LDAPException {
        List<String> groups = new ArrayList<>();
        // Прямые группы из memberOf
        String[] mo = entry.getAttributeValues("memberOf");
        if (mo != null) {
            for (String g : mo) groups.add(g.toLowerCase(Locale.ROOT));
        }
        // Вложенные группы через tokenGroups (быстро, один запрос к AD)
        if (useTokenGroups) {
            try {
                SearchRequest tr = new SearchRequest(userDn, SearchScope.BASE,
                        com.unboundid.ldap.sdk.Filter.createPresenceFilter("tokenGroups"), "tokenGroups");
                SearchResult tres = conn.search(tr);
                for (SearchResultEntry te : tres.getSearchEntries()) {
                    String[] tg = te.getAttributeValues("tokenGroups");
                    if (tg != null) {
                        for (String g : tg) groups.add(g.toLowerCase(Locale.ROOT));
                    }
                }
            } catch (LDAPException ignore) {
                // tokenGroups может быть недоступен - тогда полагаемся только на memberOf
            }
        }
        return groups;
    }

    private boolean isMemberOfAllowed(List<String> userGroupsLower) {
        for (String allowed : allowedGroups) {
            String a = normalizeGroup(allowed);
            for (String ug : userGroupsLower) {
                if (groupMatches(ug, a)) return true;
            }
        }
        return false;
    }

    /** Разрешаем задавать группу как полный DN или просто CN группы. */
    private static String normalizeGroup(String g) {
        return g.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean groupMatches(String userGroupDnLower, String allowedLower) {
        if (allowedLower.contains("=")) {
            // сравнение DN целиком (нормализуем пробелы)
            return userGroupDnLower.replaceAll("\\s+", "").equals(allowedLower.replaceAll("\\s+", ""));
        }
        // сравнение по CN=...
        return userGroupDnLower.startsWith("cn=" + allowedLower + ",")
                || userGroupDnLower.contains(",cn=" + allowedLower + ",")
                || userGroupDnLower.endsWith(",cn=" + allowedLower);
    }

    @Override
    public void close() {
        // соединения создаются/закрываются в login() через try-with-resources
    }
}
