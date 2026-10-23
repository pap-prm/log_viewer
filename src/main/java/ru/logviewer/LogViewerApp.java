package ru.logviewer;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.servlet.ServletHolder;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Точка входа. Запуск:
 *   java -jar log-viewer.jar [путь/к/config.properties]
 * По умолчанию конфиг ищется в /etc/log-viewer/config.properties
 * (или в переменной окружения LOGVIEWER_CONFIG).
 */
public final class LogViewerApp {

    private static final Logger LOG = LoggerFactory.getLogger(LogViewerApp.class);
    private static final String DEFAULT_CONFIG = "/etc/log-viewer/config.properties";

    public static void main(String[] args) {
        Path configPath = resolveConfigPath(args);
        try {
            AppConfig cfg = new AppConfig(configPath);
            LOG.info(cfg.describe());

            LogService logService = new LogService(cfg);
            SessionStore sessions = new SessionStore(cfg.getSessionTimeoutMinutes());
            LdapAuthService ldapAuth = cfg.isLdapEnabled() ? new LdapAuthService(cfg) : null;
            if (ldapAuth == null) {
                LOG.warn("LDAP отключён (ldap.enabled=false) - вход будет принимать ЛЮБЫЕ учётные данные. "
                        + "Используйте только для отладки!");
            }

            Server server = buildServer(cfg, logService, ldapAuth, sessions);
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try { server.stop(); } catch (Exception e) { LOG.warn("Остановка: {}", e.getMessage()); }
                if (ldapAuth != null) ldapAuth.close();
            }));
            server.start();
            LOG.info("Log Viewer запущен на {}://{}:{}  (логи: {})",
                    cfg.isHttpsEnabled() ? "https" : "http", cfg.getBindAddress(), cfg.getPort(),
                    logService.getLogsDir());
            server.join();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            LOG.error("Прервано");
            System.exit(130);
        } catch (Exception e) {
            LOG.error("Не удалось запустить сервис: {}", e.toString(), e);
            System.exit(1);
        }
    }

    private static Server buildServer(AppConfig cfg, LogService logService,
                                      LdapAuthService ldapAuth, SessionStore sessions) throws Exception {
        Server server = new Server();

        ServerConnector connector;
        if (cfg.isHttpsEnabled()) {
            SslContextFactory.Server sslFactory = new SslContextFactory.Server();
            sslFactory.setKeyStorePath(cfg.getKeystorePath());
            sslFactory.setKeyStorePassword(cfg.getKeystorePassword());
            connector = new ServerConnector(server, sslFactory);
        } else {
            connector = new ServerConnector(server);
        }
        connector.setHost(cfg.getBindAddress());
        connector.setPort(cfg.getPort());
        server.addConnector(connector);

        ServletContextHandler context = new ServletContextHandler();
        context.setContextPath("/");
        context.addServlet(new ServletHolder(new AppServlet(cfg, logService, ldapAuth, sessions)), "/*");

        server.setHandler(context);
        return server;
    }

    private static Path resolveConfigPath(String[] args) {
        if (args.length >= 1 && !args[0].isBlank()) {
            return Paths.get(args[0]);
        }
        String env = System.getenv("LOGVIEWER_CONFIG");
        if (env != null && !env.isBlank()) {
            return Paths.get(env);
        }
        // локальный запуск для разработки: ./config.properties рядом с jar
        Path local = Paths.get("config.properties");
        if (java.nio.file.Files.isRegularFile(local)) {
            return local.toAbsolutePath();
        }
        return Paths.get(DEFAULT_CONFIG);
    }
}
