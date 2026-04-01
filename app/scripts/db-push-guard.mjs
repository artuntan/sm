#!/usr/bin/env node

console.error(
  [
    "Direct schema pushes are disabled for this project.",
    "Use `npm run db:generate` and `npm run db:migrate` instead.",
    "If you are working in a disposable local environment and truly need a push, run `npm run db:push:unsafe` explicitly.",
  ].join("\n")
);

process.exit(1);
