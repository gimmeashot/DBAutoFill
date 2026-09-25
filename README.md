# DB AutoFill

CLI-программа на TypeScript для генерации тестовых данных по метаданным PostgreSQL.

## Быстрый старт

```bash
pnpm install
pnpm build
node dist/cli.js inspect --connection "postgresql://postgres:postgres@localhost:5432/app"
node dist/cli.js plan --connection "postgresql://postgres:postgres@localhost:5432/app"
node dist/cli.js generate --connection "postgresql://postgres:postgres@localhost:5432/app" --rows 10
```

`generate` по умолчанию только печатает данные. Для записи добавьте `--execute`:

```bash
node dist/cli.js generate --connection "$DATABASE_URL" --rows 10 --seed 42 --execute
```

Запись выполняется в транзакции. При любой ошибке вся операция откатывается.

Можно выбрать таблицы и передать конфигурацию:

```bash
node dist/cli.js generate --connection "$DATABASE_URL" \
  --tables users,orders --config db-autofill.config.example.mjs
```

Конфигурация задаёт схему, количество строк, исключённые таблицы и фиксированные
значения или наборы значений колонок. Пример: `db-autofill.config.example.mjs`.

## Текущее состояние MVP

- анализ таблиц, столбцов, ключей и enum через метаданные PostgreSQL;
- планирование порядка таблиц и заполнение внешних ключей значениями созданных родительских строк;
- повторяемая генерация основных типов и семантических полей;
- безопасный preview и транзакционная вставка;
- диагностика циклических зависимостей.
- проверка конфигурации по реальным таблицам и колонкам;
- итоговый отчёт по количеству обработанных таблиц и строк.

Следующий этап после MVP: составные ограничения, программируемые функции-генераторы
и расширенная обработка циклических зависимостей.

## Ограничения версии 0.1.0

- составные внешние и уникальные ключи пока не поддерживаются;
- циклические внешние ключи диагностируются, но автоматически не заполняются;
- сложные `CHECK`-ограничения, доменные типы и PostGIS требуют пользовательских правил;
- конфигурация считается доверенным локальным файлом: JavaScript-конфиги выполняются Node.js;
- перед использованием на важной базе сначала запускайте preview и резервное копирование.

## Интеграционный тест

При наличии Docker тестовую БД можно запустить так:

```bash
docker compose up -d --wait
```

Затем задайте подключение и запустите тест:

```powershell
$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/db_autofill_test"
pnpm test:integration
```

Без `TEST_DATABASE_URL` PostgreSQL-тест автоматически пропускается. При генерации
внешние ключи могут ссылаться как на новые, так и на существующие строки.
