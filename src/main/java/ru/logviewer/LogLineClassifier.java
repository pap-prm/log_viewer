package ru.logviewer;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Определение уровня лог-строки и подсветка ключевых слов.
 *
 * Лог пишется Java-программой (уровни SLF4J/Log4J: TRACE/DEBUG/INFO/WARN/ERROR/FATAL,
 * а также сообщения вида "Exception in thread ...", stacktrace'ы).
 * Поэтому уровень сначала ищется по формату лога (обычно в начале строки),
 * затем - как слово где угодно в строке.
 */
public final class LogLineClassifier {

    /** Классификация строки: уровень + HTML с подсветкой. */
    public record Classified(String level, String html) {}

    // Ключевые слова -> CSS-класс подсветки. Порядок важен: более "тяжёлые" раньше.
    private static final String[] FATAL_WORDS = {"FATAL", "SEVERE", "CRITICAL", "PANIC", "EMERGENCY", "ALERT"};
    private static final String[] ERROR_WORDS = {"ERROR", "EXCEPTION", "FAILED", "FAILURE", "SEVERE"};
    private static final String[] WARN_WORDS = {"WARNING", "WARN"};
    private static final String[] INFO_WORDS = {"INFO", "NOTICE"};
    private static final String[] DEBUG_WORDS = {"DEBUG", "TRACE", "FINEST", "FINER", "FINE"};

    // Уровень в начале строки: "2026-10-22 16:09:01,234 ERROR [main] ..." / "[ERROR]" / "ERROR:"
    private static final Pattern LEADING_LEVEL = Pattern.compile(
            "^\\s*(?:\\[?\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}[:.,]\\d{1,6}\\S*\\]?\\s*"
                    + "|\\[[^\\]]{0,80}\\]\\s*)?"
                    + "\\[?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|SEVERE|CRITICAL|PANIC|NOTICE)\\b",
            Pattern.CASE_INSENSITIVE);

    // Stacktrace Java: "\tat java.base/...", "Caused by:", "... 12 more"
    private static final Pattern STACK_LINE = Pattern.compile(
            "^\\s*(at\\s+[\\w$.]+\\(|Caused by:|Suppressed:|\\.\\.\\.\\s+\\d+\\s+more|\\tat\\s)", Pattern.CASE_INSENSITIVE);

    private LogLineClassifier() {}

    public static Classified classify(String rawLine) {
        String line = normalize(rawLine);
        String level = detectLevel(line);
        String html = highlight(line);
        return new Classified(level, html);
    }

    private static String normalize(String s) {
        // Защита от невалидных байтов уже сделана на уровне чтения файла; здесь лишь обрезка.
        return s.length() > 0 ? s : "";
    }

    /** Возвращает нормализованный уровень строки: TRACE/DEBUG/INFO/WARN/ERROR/FATAL/NONE. */
    public static String detectLevel(String line) {
        Matcher m = LEADING_LEVEL.matcher(line);
        if (m.find()) {
            return canonical(m.group(1));
        }
        // stacktrace относим к ERROR - это часть исключения
        if (STACK_LINE.matcher(line).find()) {
            return "ERROR";
        }
        // Поиск по словам в любом месте строки (приоритет: FATAL > ERROR > WARN > INFO > DEBUG)
        String upper = line.toUpperCase(Locale.ROOT);
        if (containsWord(upper, FATAL_WORDS)) return "FATAL";
        if (containsWord(upper, ERROR_WORDS)) return "ERROR";
        if (containsWord(upper, WARN_WORDS)) return "WARN";
        if (containsWord(upper, INFO_WORDS)) return "INFO";
        if (containsWord(upper, DEBUG_WORDS)) return "DEBUG";
        return "NONE";
    }

    private static String canonical(String word) {
        String w = word.toUpperCase(Locale.ROOT);
        switch (w) {
            case "WARNING": return "WARN";
            case "SEVERE":
            case "CRITICAL":
            case "PANIC":
            case "FATAL":   return "FATAL";
            case "ERROR":   return "ERROR";
            case "NOTICE":  return "INFO";
            case "TRACE":
            case "FINEST":
            case "FINER":
            case "FINE":    return "DEBUG";
            default:        return w; // INFO, DEBUG, WARN
        }
    }

    /** Проверка наличия слова как отдельного токена (без учёта регистра), с поддержкой ERROR_/EXCEPTION и т.п. */
    private static boolean containsWord(String upperText, String[] words) {
        for (String w : words) {
            int idx = 0;
            while ((idx = upperText.indexOf(w, idx)) >= 0) {
                boolean leftOk = idx == 0 || !isLetterOrDigit(upperText.charAt(idx - 1));
                int end = idx + w.length();
                // допускаем WARN->WARNING, ERROR->ERRORS, EXCEPTION->EXCEPTIONS (суффикс только из букв)
                boolean rightOk = end >= upperText.length()
                        || !isLetterOrDigit(upperText.charAt(end))
                        || isSuffixContinuation(upperText, end);
                if (leftOk && rightOk) {
                    return true;
                }
                idx = end;
            }
        }
        return false;
    }

    private static boolean isSuffixContinuation(String text, int end) {
        // Разрешаем простые английские суффиксы множественного числа/глаголов: S, ED, ING, AL, E
        int len = text.length() - end;
        if (len < 1 || len > 3) return false;
        String suf = text.substring(end).toUpperCase(Locale.ROOT);
        return suf.equals("S") || suf.equals("ED") || suf.equals("AL") || suf.equals("E");
    }

    private static boolean isLetterOrDigit(char c) {
        return Character.isLetterOrDigit(c);
    }

    // ---------- Подсветка ----------

    // Регэксп подсветки компилируется один раз (статически) - важно для больших файлов
    private static final Pattern HIGHLIGHT_PATTERN = Pattern.compile(
            "\\b(FATAL|SEVERE|CRITICAL|PANIC|EMERGENCY|ALERT"
                    + "|ERRORS?|EXCEPTIONS?|FAILED|FAILURE"
                    + "|WARNING|WARN|INFO|NOTICE"
                    + "|DEBUG|TRACE)\\b",
            Pattern.CASE_INSENSITIVE);

    /** Экранирует HTML и оборачивает ключевые слова в <span class="hl hl-XXX">. */
    public static String highlight(String line) {
        if (line.isEmpty()) return "";
        Matcher m = HIGHLIGHT_PATTERN.matcher(line);
        StringBuilder sb = new StringBuilder(line.length() + 32);
        int last = 0;
        while (m.find()) {
            sb.append(escapeHtml(line.substring(last, m.start())));
            String word = m.group(1);
            String cssClass = cssClassFor(word);
            sb.append("<span class=\"hl ").append(cssClass).append("\">")
              .append(escapeHtml(m.group(0)))
              .append("</span>");
            last = m.end();
        }
        sb.append(escapeHtml(line.substring(last)));
        return sb.toString();
    }

    private static String cssClassFor(String word) {
        String w = word.toUpperCase(Locale.ROOT);
        switch (canonical(w)) {
            case "FATAL": return "hl-fatal";
            case "ERROR": return "hl-error";
            case "WARN":  return "hl-warn";
            case "INFO":  return "hl-info";
            case "DEBUG": return "hl-debug";
            default:      return "hl-other";
        }
    }

    public static String escapeHtml(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&': sb.append("&amp;"); break;
                case '<': sb.append("&lt;"); break;
                case '>': sb.append("&gt;"); break;
                case '"': sb.append("&quot;"); break;
                case '\'': sb.append("&#39;"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }
}
