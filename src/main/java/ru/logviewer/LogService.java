package ru.logviewer;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Чтение логов из папки, заданной в конфиг-файле (logs.dir).
 * Все операции защищены от Directory Traversal: имя файла проверяется
 * на принадлежность именно этой папке (канонализация путей).
 */
public final class LogService {

    /** Описание одного лог-файла для списка. */
    public record FileEntry(String name, long size, long lastModified) {}

    /** Результат чтения "хвоста" файла. */
    public record TailResult(List<String> lines, long totalLinesRead, boolean truncated) {}

    private final Path logsDir;
    private final List<String> suffixes;
    private final int maxTailLines;
    private final int maxLineLength;

    public LogService(AppConfig cfg) {
        this.logsDir = cfg.getLogsDir().toAbsolutePath().normalize();
        this.maxTailLines = cfg.getMaxTailLines();
        this.maxLineLength = cfg.getMaxLineLength();
        List<String> sfx = new ArrayList<>();
        for (String s : cfg.getLogFileSuffixes().split(",")) {
            String t = s.trim().toLowerCase(Locale.ROOT);
            if (!t.isEmpty()) {
                if (!t.startsWith(".")) t = "." + t;
                sfx.add(t);
            }
        }
        this.suffixes = sfx;
    }

    public Path getLogsDir() {
        return logsDir;
    }

    /** Список файлов логов в папке (по убыванию даты изменения). */
    public List<FileEntry> listLogFiles() throws IOException {
        List<FileEntry> result = new ArrayList<>();
        if (!Files.isDirectory(logsDir)) {
            throw new IOException("Папка с логами не существует или недоступна: " + logsDir);
        }
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(logsDir)) {
            for (Path p : ds) {
                if (!Files.isRegularFile(p, LinkOption.NOFOLLOW_LINKS)) continue;
                // читаем только обычные файлы без перехода по симлинкам наружу
                String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
                boolean match = false;
                for (String s : suffixes) {
                    if (name.endsWith(s)) { match = true; break; }
                }
                if (!match) continue;
                result.add(new FileEntry(
                        p.getFileName().toString(),
                        Files.size(p),
                        Files.getLastModifiedTime(p).toMillis()));
            }
        }
        result.sort(Comparator.comparingLong(FileEntry::lastModified).reversed());
        return result;
    }

    /**
     * Безопасное разрешение имени файла внутри logs.dir.
     * @throws SecurityException если файл пытается выйти за пределы папки (../ и т.п.)
     */
    public Path resolveLogFile(String requestedName) throws IOException {
        if (requestedName == null || requestedName.isBlank()) {
            throw new SecurityException("Имя файла не задано");
        }
        String cleaned = requestedName.replace('\\', '/');
        // запрещаем пути и управляющие символы
        if (cleaned.contains("/") || cleaned.contains("\0")
                || cleaned.equals(".") || cleaned.equals("..")) {
            throw new SecurityException("Недопустимое имя файла: " + requestedName);
        }
        Path candidate = logsDir.resolve(cleaned).normalize();
        if (!candidate.startsWith(logsDir)) {
            throw new SecurityException("Попытка выхода за пределы папки логов: " + requestedName);
        }
        if (!Files.isRegularFile(candidate, LinkOption.NOFOLLOW_LINKS)) {
            throw new SecurityException("Файл не найден: " + requestedName);
        }
        return candidate;
    }

    /**
     * Прочитать последние {@code tail} строк файла.
     * Реализация - потоковое чтение с кольцевым буфером: подходит даже для
     * многосотмегабайтных логов, не требует случайного доступа к файлу
     * (важно, т.к. Java-приложение может писать лог непрерывно).
     */
    public TailResult readTail(Path file, int tail) throws IOException {
        int limit = Math.max(1, Math.min(tail <= 0 ? maxTailLines : tail, maxTailLines));
        ArrayDequeSafe window = new ArrayDequeSafe(limit);
        long total = 0;
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(Files.newInputStream(file), StandardCharsets.UTF_8), 1 << 16)) {
            String line;
            while ((line = br.readLine()) != null) {
                total++;
                if (line.length() > maxLineLength) {
                    line = line.substring(0, maxLineLength) + "…[обрезано]";
                }
                window.addLast(line);
            }
        } catch (java.io.UncheckedIOException e) {
            throw e.getCause();
        }
        List<String> lines = window.asList();
        return new TailResult(lines, total, total > lines.size());
    }

    /** Простейший потокобезопасный "deque" ограниченного размера на массиве. */
    private static final class ArrayDequeSafe {
        private final String[] buf;
        private final int cap;
        private int head = 0;   // индекс первого элемента
        private int size = 0;

        ArrayDequeSafe(int capacity) {
            this.cap = capacity;
            this.buf = new String[capacity];
        }

        synchronized void addLast(String s) {
            if (size < cap) {
                buf[(head + size) % cap] = s;
                size++;
            } else {
                buf[head] = s;
                head = (head + 1) % cap;
            }
        }

        synchronized List<String> asList() {
            List<String> out = new ArrayList<>(size);
            for (int i = 0; i < size; i++) {
                out.add(buf[(head + i) % cap]);
            }
            return out;
        }
    }
}
