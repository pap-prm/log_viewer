package ru.logviewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

/**
 * Единый сервлет: страницы входа/просмотра и JSON API.
 * Все запросы, кроме /login, /logout, /static/* требуют активной сессии (группа MS AD).
 */
public class AppServlet extends HttpServlet {

    private final AppConfig cfg;
    private final LogService logService;
    private final LdapAuthService ldapAuth;   // null если ldap.enabled=false (не рекомендуется)
    private final SessionStore sessions;
    private final ObjectMapper json = new ObjectMapper();

    public AppServlet(AppConfig cfg, LogService logService, LdapAuthService ldapAuth, SessionStore sessions) {
        this.cfg = cfg;
        this.logService = logService;
        this.ldapAuth = ldapAuth;
        this.sessions = sessions;
    }

    // ---------- HTTP методы ----------

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = normalizePath(req.getRequestURI());

        switch (path) {
            case "/":
            case "/index.html":
                if (isAuthed(req)) redirect(resp, "/logs");
                else serveLoginPage(resp);
                return;
            case "/login":
                serveLoginPage(resp);
                return;
            case "/logout":
                doLogout(req, resp);
                return;
            case "/logs":
                requireAuth(req, resp, () -> serveLogsPage(req, resp));
                return;
            case "/api/files":
                requireAuth(req, resp, () -> apiFiles(resp));
                return;
            case "/api/log":
                requireAuth(req, resp, () -> apiLog(req, resp));
                return;
            case "/static/app.css":
                serveStatic(resp, "static/app.css", "text/css; charset=utf-8");
                return;
            case "/static/app.js":
                serveStatic(resp, "static/app.js", "application/javascript; charset=utf-8");
                return;
            default:
                resp.sendError(HttpServletResponse.SC_NOT_FOUND, "Не найдено");
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = normalizePath(req.getRequestURI());
        if (path.equals("/api/login")) {
            apiLogin(req, resp);
        } else if (path.equals("/logout")) {
            doLogout(req, resp);
        } else {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
        }
    }

    // ---------- Аутентификация ----------

    private boolean isAuthed(HttpServletRequest req) {
        if (!cfg.isLdapEnabled()) return true; // режим без LDAP (только для отладки!)
        return findSession(req) != null;
    }

    private SessionStore.Session findSession(HttpServletRequest req) {
        Cookie[] cookies = req.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (c.getName().equals(cfg.getSessionCookieName())) {
                return sessions.get(c.getValue());
            }
        }
        return null;
    }

    private interface Handler { void handle() throws IOException; }

    private void requireAuth(HttpServletRequest req, HttpServletResponse resp, Handler h) throws IOException {
        setSecurityHeaders(resp);
        if (!isAuthed(req)) {
            // API - отдаём 401 в JSON; страница - редирект на /login
            if (req.getRequestURI().startsWith("/api/")) {
                sendJson(resp, HttpServletResponse.SC_UNAUTHORIZED,
                        errorNode("Сессия не найдена или истекла. Войдите заново."));
            } else {
                redirect(resp, "/login");
            }
            return;
        }
        h.handle();
    }

    private void apiLogin(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        setSecurityHeaders(resp);
        String contentType = req.getContentType();
        String username, password;
        if (contentType != null && contentType.contains("application/json")) {
            ObjectNode body = (ObjectNode) json.readTree(req.getInputStream());
            username = body.path("username").asText("");
            password = body.path("password").asText("");
        } else {
            username = nvl(req.getParameter("username"));
            password = nvl(req.getParameter("password"));
        }

        if (!cfg.isLdapEnabled()) {
            // отладочный режим без AD
            createSessionCookie(resp, username.isBlank() ? "dev" : username, "Отключён LDAP");
            redirect(resp, "/logs");
            return;
        }

        LdapAuthService.LoginResult r = ldapAuth.login(username, password);
        boolean wantsJson = contentType != null && contentType.contains("application/json");
        if (!r.success()) {
            if (wantsJson) {
                sendJson(resp, HttpServletResponse.SC_UNAUTHORIZED, errorNode(r.message()));
            } else {
                serveLoginPage(resp, r.message());
            }
            return;
        }
        if (wantsJson) {
            ObjectNode ok = json.createObjectNode();
            ok.put("status", "ok");
            ok.put("user", r.displayName());
            sendJson(resp, HttpServletResponse.SC_OK, ok);
        } else {
            createSessionCookie(resp, username, r.displayName());
            redirect(resp, "/logs");
        }
    }

    private void createSessionCookie(HttpServletResponse resp, String username, String displayName) {
        SessionStore.Session s = sessions.create(username, displayName);
        StringBuilder cookie = new StringBuilder();
        cookie.append(cfg.getSessionCookieName()).append('=').append(s.id)
              .append("; Path=/; HttpOnly; SameSite=Strict");
        if (cfg.isHttpsEnabled()) cookie.append("; Secure");
        resp.setHeader("Set-Cookie", cookie.toString());
    }

    private void doLogout(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        SessionStore.Session s = findSession(req);
        if (s != null) sessions.invalidate(s.id);
        String c = cfg.getSessionCookieName() + "=deleted; Path=/; Max-Age=0; HttpOnly; SameSite=Strict";
        resp.setHeader("Set-Cookie", c);
        redirect(resp, "/login");
    }

    // ---------- Страницы ----------

    private void serveLoginPage(HttpServletResponse resp) throws IOException { serveLoginPage(resp, null); }

    private void serveLoginPage(HttpServletResponse resp, String errorMsg) throws IOException {
        setSecurityHeaders(resp);
        String html = HtmlTemplates.login(errorMsg);
        writeHtml(resp, HttpServletResponse.SC_OK, html);
    }

    private void serveLogsPage(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        setSecurityHeaders(resp);
        SessionStore.Session s = findSession(req);
        String user = s == null ? "" : s.displayName;
        writeHtml(resp, HttpServletResponse.SC_OK, HtmlTemplates.viewer(user, cfg.isHttpsEnabled()));
    }

    // ---------- API ----------

    private void apiFiles(HttpServletResponse resp) throws IOException {
        try {
            List<LogService.FileEntry> files = logService.listLogFiles();
            ObjectNode root = json.createObjectNode();
            root.put("logsDir", logService.getLogsDir().toString());
            ArrayNode arr = root.putArray("files");
            for (LogService.FileEntry f : files) {
                ObjectNode fn = arr.addObject();
                fn.put("name", f.name());
                fn.put("size", f.size());
                fn.put("lastModified", Instant.ofEpochMilli(f.lastModified()).toString());
            }
            sendJson(resp, HttpServletResponse.SC_OK, root);
        } catch (IOException e) {
            sendJson(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, errorNode(e.getMessage()));
        }
    }

    /**
     * GET /api/log?file=app.log&tail=2000&level=ERROR,WARN&search=scheduler&offset=0
     */
    private void apiLog(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String fileParam = req.getParameter("file");
        if (fileParam == null || fileParam.isBlank()) {
            sendJson(resp, HttpServletResponse.SC_BAD_REQUEST, errorNode("Не указан параметр file"));
            return;
        }
        Path file;
        try {
            file = logService.resolveLogFile(fileParam);
        } catch (SecurityException e) {
            sendJson(resp, HttpServletResponse.SC_FORBIDDEN, errorNode(e.getMessage()));
            return;
        } catch (IOException e) {
            sendJson(resp, HttpServletResponse.SC_NOT_FOUND, errorNode(e.getMessage()));
            return;
        }

        int tail = parseInt(req.getParameter("tail"), 2000);
        String levelFilter = req.getParameter("level");           // например "ERROR,FATAL"
        String search = req.getParameter("search");               // подстрока (без учёта регистра)

        try {
            LogService.TailResult t = logService.readTail(file, tail);
            ObjectNode root = json.createObjectNode();
            root.put("file", file.getFileName().toString());
            root.put("totalLines", t.totalLinesRead());
            root.put("truncated", t.truncated());

            ArrayNode linesArr = root.putArray("lines");
            long idx = 0;
            for (String raw : t.lines()) {
                idx++;
                LogLineClassifier.Classified c = LogLineClassifier.classify(raw);
                if (levelFilter != null && !levelFilter.isBlank()) {
                    if (!matchesLevel(levelFilter, c.level())) continue;
                }
                if (search != null && !search.isBlank()) {
                    if (!containsIgnoreCase(raw, search)) continue;
                }
                ObjectNode ln = linesArr.addObject();
                ln.put("n", idx);
                ln.put("level", c.level());
                ln.put("html", c.html());
            }
            sendJson(resp, HttpServletResponse.SC_OK, root);
        } catch (IOException e) {
            sendJson(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, errorNode(e.getMessage()));
        }
    }

    private static boolean matchesLevel(String filterCsv, String level) {
        for (String f : filterCsv.split(",")) {
            String ft = f.trim().toUpperCase();
            if (ft.isEmpty()) continue;
            if (ft.equals(level)) return true;
            if (ft.equals("WARNING") && level.equals("WARN")) return true;
        }
        return false;
    }

    private static boolean containsIgnoreCase(String text, String needle) {
        return text.toLowerCase().contains(needle.toLowerCase());
    }

    // ---------- Утилиты ----------

    private static String normalizePath(String uri) {
        if (uri == null || uri.isEmpty()) return "/";
        // убираем ;jsessionid и лишнее
        int semicolon = uri.indexOf(';');
        if (semicolon > 0) uri = uri.substring(0, semicolon);
        return uri;
    }

    private void setSecurityHeaders(HttpServletResponse resp) {
        resp.setHeader("X-Content-Type-Options", "nosniff");
        resp.setHeader("X-Frame-Options", "DENY");
        resp.setHeader("Referrer-Policy", "same-origin");
        resp.setHeader("Content-Security-Policy",
                "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:");
    }

    private void sendJson(HttpServletResponse resp, int status, ObjectNode node) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json; charset=utf-8");
        resp.getWriter().write(json.writeValueAsString(node));
    }

    private ObjectNode errorNode(String msg) {
        ObjectNode n = json.createObjectNode();
        n.put("error", msg == null ? "Внутренняя ошибка" : msg);
        return n;
    }

    private void writeHtml(HttpServletResponse resp, int status, String html) throws IOException {
        resp.setStatus(status);
        resp.setContentType("text/html; charset=utf-8");
        resp.getWriter().write(html);
    }

    private void serveStatic(HttpServletResponse resp, String resource, String contentType) throws IOException {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                resp.sendError(HttpServletResponse.SC_NOT_FOUND);
                return;
            }
            resp.setStatus(HttpServletResponse.SC_OK);
            resp.setContentType(contentType);
            resp.setHeader("Cache-Control", "no-cache");
            in.transferTo(resp.getOutputStream());
        }
    }

    private static int parseInt(String s, int def) {
        if (s == null || s.isBlank()) return def;
        try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return def; }
    }

    private static String nvl(String s) { return s == null ? "" : s; }

    private static void redirect(HttpServletResponse resp, String location) throws IOException {
        resp.setStatus(HttpServletResponse.SC_FOUND);
        resp.setHeader("Location", location);
    }
}
