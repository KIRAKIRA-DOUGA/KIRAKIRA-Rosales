# Repository Guidelines

These instructions apply to the entire repository unless a more specific `AGENTS.md` provides additional guidance.

## Commit Messages

- Every new commit message must start with an appropriate gitmoji emoji, followed by a space and a concise Chinese description.
- Use the format `<gitmoji> <Chinese description>`, for example: `🐛 修复评论投票并发超时` or `📝 添加仓库开发规范`.
- Write explanatory commit bodies in Chinese as well. Keep code identifiers and established technical terms in their original form when necessary.
- Describe the actual change. Do not use an English Conventional Commits prefix in place of the required format.

## Code Style and Maintainability

- Before editing, read the surrounding code and comparable existing implementations. Use the established, human-written code as the primary style reference; consult Git history when recent generated code obscures those conventions.
- Match the local conventions for indentation, quotes, semicolons, naming, imports, comments, and function structure. Preserve existing Chinese comments and user-facing terminology.
- Keep changes focused on the requested behavior. Avoid unrelated formatting, renaming, dependency additions, or broad refactoring.
- Reuse existing shared helpers and architectural layers when they fit the task. Avoid duplicated business logic, unnecessary wrappers, speculative abstractions, and one-off frameworks.
- Reduce code smells in the code you touch: prefer clear control flow, meaningful names, explicit error handling, and reliable resource cleanup. Remove dead code and redundant checks introduced by your changes.
- Do not copy a known bug or unsafe pattern merely to match older code. Preserve the surrounding style while making the smallest correct improvement.
- Add comments only when they explain intent, constraints, or non-obvious behavior; do not narrate obvious statements.
- Verify behavioral changes with relevant checks. For database or concurrency changes, use the documented `local/dev-infra` environment when available, isolate test records, and clean them up afterward. Never expose credentials or modify unrelated data.
