# Repository Guidelines

These instructions apply to the entire repository unless a more specific `AGENTS.md` provides additional guidance.

## Commit Messages

- Every new commit message must start with an appropriate gitmoji emoji, followed by a space and a concise Chinese description.
- Use the format `<gitmoji> <Chinese description>`, for example: `🐛 修复评论投票并发超时` or `📝 添加仓库开发规范`.
- Write explanatory commit bodies in Chinese as well. Keep code identifiers and established technical terms in their original form when necessary.
- Describe the actual change. Do not use an English Conventional Commits prefix in place of the required format.

## TypeScript Formatting

- Follow `.editorconfig` and `eslint.config.js`: UTF-8 without a BOM, LF line endings, tabs for indentation, no trailing whitespace in code, and a final newline.
- Use single-quoted strings and omit statement-ending semicolons in new or edited TypeScript code. Use template literals for interpolation and semicolons only where required for correct parsing. Type member separators are distinct from statement terminators: retain the existing semicolon style in DTO/type declarations.
- Use trailing commas in multiline object and array literals. Put a space after commas and around binary operators and arrow tokens.
- Use spaces inside object braces (`{ videoId }`), but not inside array brackets (`[videoId]`) or parentheses (`check(videoId)`).
- Put opening braces on the same line as the statement or declaration, and write `} else {` and `} catch (error) {` on one line. Use braces and separate lines for business-logic branches rather than compressing multiple operations into one line.
- Use `const` unless reassignment is needed; use `let` for reassignment and never introduce `var`. Use strict equality checks.
- Keep imports at the top of the file and retain `.js` extensions in relative TypeScript module imports. Do not reorder unrelated imports or introduce path aliases just for a small change.
- Use descriptive camelCase variable/function names and PascalCase type names. Preserve established suffixes such as `Controller`, `Service`, `RequestDto`, `ResponseDto`, and `Schema`. Avoid cryptic abbreviations and generic names when a business-specific name is clearer.
- Follow the existing `export const nameService = async (...) => { ... }` pattern for service functions. Give exported service functions explicit parameter and return types; use existing DTOs and schema-derived types rather than duplicating shapes.
- Separate logical steps with blank lines. Keep simple expressions compact, but split complex conditions and data structures into readable multiline blocks. Do not impose a new wrapping style on untouched code.
- Older files contain mixed formatting. Apply these rules to new code and necessary edits only; do not reformat whole files or copy accidental formatting inconsistencies.

## Comments and Documentation

- Every exported business function must have Chinese JSDoc describing its purpose, parameters (`@param`), and return value (`@returns`). Update its documentation when behavior changes.
- Document DTO fields in Chinese, following existing inline JSDoc conventions. Keep identifiers and established technical terms in their original form.
- Add Chinese comments for complex logic to explain why it exists, especially concurrency, transaction boundaries, compatibility behavior, and unusual validation. Avoid comments that merely restate an obvious statement.
- Preserve useful existing Chinese comments and user-facing terminology. Private helpers do not need boilerplate JSDoc when their names and implementation are self-explanatory.

Example of the expected function formatting and documentation (illustrative only):

```ts
/**
 * 获取视频点赞数
 * @param videoId 视频 ID
 * @returns 视频点赞数的查询结果
 */
export const getVideoUpvoteCountService = async (videoId: number): Promise<VideoUpvoteResponseDto> => {
	const videoUpvoteCount = await getVideoUpvoteCount(videoId)

	return {
		success: true,
		message: '获取视频点赞数成功',
		videoUpvoteCount,
	}
}
```

## Architecture and Agent Boundaries

- Before editing, read surrounding code and comparable established, human-written implementations. Consult Git history when recent generated code obscures the original conventions. Do not reproduce a known bug or unsafe pattern just to resemble older code.
- Keep controllers focused on request/response handling and established authorization checks, services on business logic, and database access in the shared database layer. Preserve existing response DTOs, error conventions, and public interfaces.
- Business code should use shared database and logging helpers. If a helper lacks a required capability, extend the shared layer narrowly rather than bypassing it with direct model operations or duplicating access logic.
- Keep changes focused on the requested behavior. By default, do not perform unrelated refactoring, add dependencies, or change interfaces without task justification.
- Avoid speculative abstractions, redundant wrappers, duplicate business logic, excessive nesting, and dead code. Prefer clear control flow and meaningful names over clever or compressed expressions.
- Do not use `any`, double type assertions, type-check suppression, or swallowed exceptions to hide a correctness problem. Validate external inputs, narrow types, and handle or propagate errors explicitly. Preserve error information required by transaction retries.
- Release sessions and other resources on every exit path. Await work whose completion affects correctness; detached work must have explicit error handling and a justified lifecycle.
- The architecture and maintainability rules above are defaults, not an extra approval gate. A small, necessary exception within the authorized task is allowed after explaining the concrete reason, scope, and tradeoff to the user. Keep it local and mention it in the completion summary. This does not waive the required commit-message format or authorize unrelated work.

## Verification

- Run checks relevant to the change and report what was actually verified. Do not claim mocked tests demonstrate real database behavior.
- For database or concurrency changes, use the documented `local/dev-infra` environment when available, isolate test records, and clean them up afterward. Never expose credentials or modify unrelated data.
- Do not weaken tests or simply change their expectations to conceal a failure. When behavior intentionally changes, update the corresponding expectations and verify the intended outcome.
