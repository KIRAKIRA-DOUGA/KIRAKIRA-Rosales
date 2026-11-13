# Repository Guidelines

These instructions apply to the entire repository unless a more specific `AGENTS.md` provides additional guidance.

## Project Documentation

- Read the relevant sections of [docs/README.md](docs/README.md) before proposing or implementing changes. Use its development guide as the reference for the project structure and request/data-access flow.
- For setup and configuration, consult its installation section together with `.env.template` and the current `package.json` scripts. For API work, consult its routing and request/response sections together with `src/route/router.ts` and the relevant controller DTOs.
- For persistence or search work, consult its MongoDB and Elasticsearch sections and the corresponding shared helpers. For build changes, consult its build/deployment section and the current build configuration.
- Documentation examples are illustrative and may contain outdated names, formatting, or incomplete snippets. Verify them against current code. Follow the explicit rules in this file for formatting, helper reuse, and push approval; do not reproduce an example's mistakes or execute deployment/push commands merely because they appear in the documentation.
- Include the relevant documentation and any discrepancies in the implementation plan when they affect the approach. If an authorized change makes documented behavior or setup inaccurate, update the affected documentation with the change.

## Commit Messages

- Every new commit message must start with an appropriate gitmoji emoji, followed by a space and a concise Chinese description.
- Use the format `<gitmoji> <Chinese description>`, for example: `🐛 修复评论投票并发超时` or `📝 添加仓库开发规范`.
- Write explanatory commit bodies in Chinese as well. Keep code identifiers and established technical terms in their original form when necessary.
- Describe the actual change. Do not use an English Conventional Commits prefix in place of the required format.

## Push Approval

- Do not push commits, branches, or tags without explicit user confirmation for the pending push. A request to edit, fix, review, or commit does not authorize pushing. Previous approval does not authorize later pushes.
- Complete the local changes and relevant checks first, summarize the exact changes and results, then ask for confirmation before pushing. Keep the work local while waiting. This requirement is not covered by the small-exception policy below.

## Before Implementation

- Before implementing a feature or changing behavior, explain the proposed implementation to the user. Read-only investigation may happen first so the proposal is grounded in the existing code.
- Provide a concise, numbered plan covering the implementation steps and how the result will be verified. Identify the main modules or files involved and the existing helpers or patterns that will be reused.
- State the expected impact: user-visible behavior, affected interfaces and callers, data or schema changes, dependencies or configuration, and relevant compatibility, performance, or deployment risks. Explicitly note material uncertainties; do not claim that an impact has been verified before checking it.
- Scale the detail to the task. Small changes need only a short plan and impact statement; larger changes require enough detail for the user to understand the scope and tradeoffs.
- If investigation changes the approach or reveals a materially larger impact, update the user before implementing the revised approach.
- This is a communication requirement, not an additional approval gate for already authorized implementation work. Honor any explicit request to wait for approval, and always follow the separate push-confirmation requirement above.

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
- Follow the directory responsibilities described in `docs/README.md`: routes in `src/route`, controller DTOs in `src/controller`, reusable utilities in `src/common`, MongoDB schemas in `src/dbPool/schema`, shared types in `src/type`, and translated text in `src/locales`.
- Register route handlers as function references in `src/route/router.ts`, not function calls. Use the project's `koaCtx` and `koaNext` types and preserve the established `ctx.body` / `await next()` flow where appropriate. Follow existing query-parameter conventions rather than introducing dynamic path parameters without a task-specific reason.
- Validate query parameters, request bodies, and cookies at runtime. Repeated query parameters can be arrays; TypeScript assertions do not validate external input.
- Follow the documented schema pattern: keep `schema`, `collectionName`, and `schemaInstance` together; derive MongoDB types with `InferSchemaType`; construct typed filters, projections, and updates using the shared `QueryType`, `SelectType`, and `UpdateType` definitions.
- Reuse the initialized MongoDB connection and obtain Elasticsearch clients through `ctx.elasticsearchClient`, passing them to services as needed. Keep search document schemas and index names together and use `EsSchema2TsType` for document data. Do not create a new connection per request. Account for replica-read freshness and the cost of immediate search-index refreshes when explaining expected impact.
- Business code should use shared database and logging helpers. If a helper lacks a required capability, extend the shared layer narrowly rather than bypassing it with direct model operations or duplicating access logic.
- Keep changes focused on the requested behavior. By default, do not perform unrelated refactoring, add dependencies, or change interfaces without task justification.
- Avoid speculative abstractions, redundant wrappers, duplicate business logic, excessive nesting, and dead code. Prefer clear control flow and meaningful names over clever or compressed expressions.
- Do not use `any`, double type assertions, type-check suppression, or swallowed exceptions to hide a correctness problem. Validate external inputs, narrow types, and handle or propagate errors explicitly. Preserve error information required by transaction retries.
- Release sessions and other resources on every exit path. Await work whose completion affects correctness; detached work must have explicit error handling and a justified lifecycle.
- The architecture and maintainability rules above are defaults, not an extra approval gate. A small, necessary exception within the authorized task is allowed after explaining the concrete reason, scope, and tradeoff to the user. Keep it local and mention it in the completion summary. This does not waive the required commit-message format or authorize unrelated work.

## Verification

- Run `npm run lint` for TypeScript source conventions and `npm run typecheck` for type correctness. Chinese JSDoc quality, meaningful naming, architectural boundaries, and resource lifecycles also require manual review; ESLint does not fully enforce them. Do not bulk-fix historical lint violations as part of an unrelated change.
- Run checks relevant to the change and report what was actually verified. Do not claim mocked tests demonstrate real database behavior.
- For database or concurrency changes, use the documented `local/dev-infra` environment when available, isolate test records, and clean them up afterward. Never expose credentials or modify unrelated data.
- Do not weaken tests or simply change their expectations to conceal a failure. When behavior intentionally changes, update the corresponding expectations and verify the intended outcome.
