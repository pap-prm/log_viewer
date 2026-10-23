package ru.logviewer;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * Конфигурация сервиса. Читается из внешнего config-файла (по умолчанию
 * /etc/log-viewer/config.properties, либо путь указан аргументом командной строки
 * или переменной окружения LOGVIEWER_CONFIG).
 *
 * Путь к папке с логами задаётся именно здесь (logs.dir) - см. README.md.
 */
public final class AppConfig {

    private final Path configFile;
    private final Properties props = new Properties();

    // ---------- Логи ----------
    private String logsDir;
    private String logFileSuffixes = ".log,.txt,.out";
    private int maxTailLines = 5000;
    private int maxLineLength = 4096;

    // ---------- HTTP(S) ----------
    private int port = 5555;
    private String bindAddress = "0.0.0.0";
    private boolean httpsEnabled = false;
    private String keystorePath = "";
    private String keystorePassword = "";
    private String sessionCookieName = "LOGVIEWER_SESSION";
    private int sessionTimeoutMinutes = 120;

    // ---------- LDAP / LDAPS ----------
    private boolean ldapEnabled = true;          // по умолчанию включено (доступ только для группы MS AD)
    private String ldapUrl = "ldaps://dc01.corp.local:636";
    private String ldapBindDn = "CN=logviewer-svc,OU=Service Accounts,DC=corp,DC=local";
    private String ldapBindPassword = "";
    private List<String> ldapAllowedGroups = new ArrayList<>();
    private String ldapGroupAttribute = "memberOf";
    private boolean ldapTlsVerifyHostname = true;
    private boolean ldapStartTls = false;        // true = LDAP 389 + StartTLS (всё равно TLS)
    private int ldapConnectTimeoutMs = 5000;
    private String ldapTruststorePath = "";      // опционально: отдельный truststore для LDAPS
    private String ldapTruststorePassword = "";

    public AppConfig(Path configFile) throws IOException {
        this.configFile = configFile;
        if (!Files.isRegularFile(configFile)) {
            throw new IOException("Не найден файл конфигурации: " + configFile.toAbsolutePath());
        }
        try (InputStream in = Files.newInputStream(configFile)) {
            props.load(in);
        }
        load();
    }

    private void load() {
        logsDir = req("logs.dir");
        logFileSuffixes = opt("logs.file.suffixes", logFileSuffixes);
        maxTailLines = integer("logs.max.tail.lines", maxTailLines);
        maxLineLength = integer("logs.max.line.length", maxLineLength);

        port = integer("server.port", port);
        bindAddress = opt("server.bind", bindAddress);
        httpsEnabled = bool("server.https.enabled", httpsEnabled);
        keystorePath = opt("server.https.keystore.path", keystorePath);
        keystorePassword = opt("server.https.keystore.password", keystorePassword);
        sessionTimeoutMinutes = integer("server.session.timeout.minutes", sessionTimeoutMinutes);

        ldapEnabled = bool("ldap.enabled", ldapEnabled);
        ldapUrl = req("ldap.url");
        ldapBindDn = req("ldap.bind.dn");
        ldapBindPassword = req("ldap.bind.password");
        String groups = req("ldap.allowed.groups");
        for (String g : groups.split(",")) {
            String s = g.trim();
            if (!s.isEmpty()) {
                ldapAllowedGroups.add(s);
            }
        }
        ldapGroupAttribute = opt("ldap.group.attribute", ldapGroupAttribute);
        ldapTlsVerifyHostname = bool("ldap.tls.verify.hostname", ldapTlsVerifyHostname);
        ldapStartTls = bool("ldap.starttls", ldapStartTls);
        ldapConnectTimeoutMs = integer("ldap.connect.timeout.ms", ldapConnectTimeoutMs);
        ldapTruststorePath = opt("ldap.truststore.path", ldapTruststorePath);
        ldapTruststorePassword = opt("ldap.truststore.password", ldapTruststorePassword);

        validate();
    }

    private void validate() {
        List<String> problems = new ArrayList<>();

        if (logsDir == null || logsDir.isBlank()) {
            problems.add("logs.dir не задан");
        }
        if (port < 1 || port > 65535) {
            problems.add("server.port вне диапазона: " + port);
        }
        if (ldapAllowedGroups.isEmpty()) {
            problems.add("ldap.allowed.groups пуст - непонятно, какой группе MS AD разрешён доступ");
        }
        if (ldapEnabled) {
            if (ldapUrl.startsWith("ldaps://")) {
                // всё хорошо - обязательный LDAPS
            } else if (ldapUrl.startsWith("ldap://") && ldapStartTls) {
                // допустимо: LDAP + StartTLS (тоже шифрование)
            } else if (ldapUrl.startsWith("ldap://")) {
                problems.add("Использован открытый ldap:// без StartTLS. Требуется ldaps:// (или ldap:// + ldap.starttls=true)");
            } else {
                problems.add("ldap.url должен начинаться с ldaps:// или ldap://");
            }
            if (ldapBindPassword.isBlank()) {
                problems.add("ldap.bind.password не задан");
            }
        }
        if (httpsEnabled && (keystorePath.isBlank() || keystorePassword.isBlank())) {
            problems.add("server.https.enabled=true, но не заданы keystore path/password");
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Ошибки конфигурации (" + configFile + "):\n  - "
                    + String.join("\n  - ", problems));
        }
    }

    private String req(String key) {
        String v = props.getProperty(key);
        if (v == null || v.isBlank()) {
            throw new IllegalStateException("В конфиге (" + configFile + ") отсутствует обязательный параметр: " + key);
        }
        return v.trim();
    }

    private String opt(String key, String def) {
        String v = props.getProperty(key);
        return (v == null || v.isBlank()) ? def : v.trim();
    }

    private int integer(String key, int def) {
        String v = props.getProperty(key);
        if (v == null || v.isBlank()) {
            return def;
        }
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            throw new IllegalStateException("Параметр " + key + " должен быть числом, получено: " + v);
        }
    }

    private boolean bool(String key, boolean def) {
        String v = props.getProperty(key);
        return (v == null || v.isBlank()) ? def : Boolean.parseBoolean(v.trim());
    }

    /** Краткое описание конфигурации для журнала запуска (без паролей). */
    public String describe() {
        StringBuilder sb = new StringBuilder();
        sb.append("Конфигурация загружена из ").append(configFile.toAbsolutePath()).append('\n');
        sb.append("  logs.dir=").append(logsDir).append(", suffixes=").append(logFileSuffixes)
                .append(", tail<=").append(maxTailLines).append('\n');
        sb.append("  server=").append(bindAddress).append(':').append(port)
                .append(httpsEnabled ? " (HTTPS)" : " (HTTP)").append('\n');
        sb.append("  ldap.enabled=").append(ldapEnabled).append(", url=").append(ldapUrl)
                .append(", starttls=").append(ldapStartTls).append('\n');
        sb.append("  ldap.allowed.groups=").append(ldapAllowedGroups).append('\n');
        return sb.toString();
    }

    public Path getLogsDir() { return Path.of(logsDir); }
    public String getLogFileSuffixes() { return logFileSuffixes; }
    public int getMaxTailLines() { return maxTailLines; }
    public int getMaxLineLength() { return maxLineLength; }

    public int getPort() { return port; }
    public String getBindAddress() { return bindAddress; }
    public boolean isHttpsEnabled() { return httpsEnabled; }
    public String getKeystorePath() { return keystorePath; }
    public String getKeystorePassword() { return keystorePassword; }
    public String getSessionCookieName() { return sessionCookieName; }
    public int getSessionTimeoutMinutes() { return sessionTimeoutMinutes; }

    public boolean isLdapEnabled() { return ldapEnabled; }
    public String getLdapUrl() { return ldapUrl; }
    public String getLdapBindDn() { return ldapBindDn; }
    public String getLdapBindPassword() { return ldapBindPassword; }
    public List<String> getLdapAllowedGroups() { return ldapAllowedGroups; }
    public String getLdapGroupAttribute() { return ldapGroupAttribute; }
    public boolean isLdapTlsVerifyHostname() { return ldapTlsVerifyHostname; }
    public boolean isLdapStartTls() { return ldapStartTls; }
    public int getLdapConnectTimeoutMs() { return ldapConnectTimeoutMs; }
    public String getLdapTruststorePath() { return ldapTruststorePath; }
    public String getLdapTruststorePassword() { return ldapTruststorePassword; }
}
