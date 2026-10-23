package ru.logviewer;

/**
 * HTML-шаблоны страниц. Всё статическое, без внешних CDN - сервис должен работать
 * в изолированной сети предприятия.
 */
final class HtmlTemplates {

    private HtmlTemplates() {}

    static String login(String errorMsg) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>\n<html lang=\"ru\">\n<head>\n")
          .append("<meta charset=\"utf-8\">\n")
          .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
          .append("<title>Вход - Просмотр логов</title>\n")
          .append("<link rel=\"stylesheet\" href=\"/static/app.css\">\n")
          .append("</head>\n<body class=\"login-body\">\n")
          .append("<div class=\"login-card\">\n")
          .append("<h1>Просмотр логов</h1>\n")
          .append("<p class=\"muted\">Доступ только для пользователей разрешённой группы Active Directory (LDAPS)</p>\n");
        if (errorMsg != null && !errorMsg.isBlank()) {
            sb.append("<div class=\"alert alert-error\">").append(LogLineClassifier.escapeHtml(errorMsg)).append("</div>\n");
        }
        sb.append("<form method=\"post\" action=\"/api/login\">\n")
          .append("<label for=\"username\">Логин AD (sAMAccountName)</label>\n")
          .append("<input id=\"username\" name=\"username\" type=\"text\" autocomplete=\"username\" autofocus required>\n")
          .append("<label for=\"password\">Пароль</label>\n")
          .append("<input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"current-password\" required>\n")
          .append("<button type=\"submit\">Войти</button>\n")
          .append("</form>\n")
          .append("</div>\n</body>\n</html>");
        return sb.toString();
    }

    static String viewer(String user, boolean https) {
        return """
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Просмотр логов</title>
<link rel="stylesheet" href="/static/app.css">
</head>
<body class="viewer-body">
<header class="topbar">
  <div class="brand">Логи Java-приложения</div>
  <div class="toolbar">
    <select id="fileSelect" title="Файл лога"></select>
    <select id="tailSelect" title="Сколько последних строк показать">
      <option value="500">500 строк</option>
      <option value="2000" selected>2000 строк</option>
      <option value="5000">5000 строк</option>
    </select>
    <input id="searchInput" type="search" placeholder="Поиск по тексту...">
    <span class="level-filters" id="levelFilters">
      <label><input type="checkbox" value="FATAL"> FATAL</label>
      <label><input type="checkbox" value="ERROR"> ERROR</label>
      <label><input type="checkbox" value="WARN"> WARNING</label>
      <label><input type="checkbox" value="INFO"> INFO</label>
      <label><input type="checkbox" value="DEBUG"> DEBUG</label>
      <label><input type="checkbox" value="NONE"> Прочее</label>
    </span>
    <button id="btnRefresh" type="button">Обновить</button>
    <label class="autoscroll"><input type="checkbox" id="autoScroll"> авто-обновление 10с</label>
    <span class="userbox">
      <span class="username">USER_PLACEHOLDER</span>
      <a href="/logout" class="logout">Выход</a>
    </span>
  </div>
</header>
<main>
  <div id="status" class="status"></div>
  <pre id="logView" class="logview" tabindex="0"><div class="empty">Загрузка…</div></pre>
</main>
<script src="/static/app.js"></script>
</body>
</html>
""".replace("USER_PLACEHOLDER", LogLineClassifier.escapeHtml(user));
    }
}
