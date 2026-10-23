package ru.logviewer;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Хранилище аутентифицированных сессий (in-memory).
 * Идентификатор сессии - криптографически стойкий случайный токен,
 * хранится в HttpOnly/Secure cookie.
 */
public final class SessionStore {

    public static final class Session {
        public final String id;
        public final String username;
        public final String displayName;
        public final Instant createdAt;
        public volatile Instant lastAccess;

        Session(String id, String username, String displayName) {
            this.id = id;
            this.username = username;
            this.displayName = displayName;
            this.createdAt = Instant.now();
            this.lastAccess = Instant.now();
        }
    }

    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final long timeoutMillis;

    public SessionStore(int timeoutMinutes) {
        this.timeoutMillis = Math.max(1, timeoutMinutes) * 60_000L;
    }

    public Session create(String username, String displayName) {
        purgeExpired();
        byte[] buf = new byte[32];
        random.nextBytes(buf);
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
        Session s = new Session(id, username, displayName);
        sessions.put(id, s);
        return s;
    }

    /** Возвращает живую сессию или null; обновляет время последнего доступа. */
    public Session get(String id) {
        if (id == null || id.isBlank()) return null;
        Session s = sessions.get(id);
        if (s == null) return null;
        if (Instant.now().toEpochMilli() - s.lastAccess.toEpochMilli() > timeoutMillis) {
            sessions.remove(id);
            return null;
        }
        s.lastAccess = Instant.now();
        return s;
    }

    public void invalidate(String id) {
        if (id != null) sessions.remove(id);
    }

    private void purgeExpired() {
        long now = Instant.now().toEpochMilli();
        sessions.entrySet().removeIf(e -> now - e.getValue().lastAccess.toEpochMilli() > timeoutMillis);
    }
}
