/**
 * Conventional Commits, enforced on every commit (husky commit-msg hook).
 *
 *   <type>(<scope>): <summary>      e.g. feat(core/curriculum): add LHCF schema
 *
 * Types: feat fix docs refactor perf test build ci chore revert style.
 * Scopes are free-form but name the area: core/<domain>, db, web, web/ui,
 * native, mcp, cli, scripts, docs. One logical change per commit — see AGENTS.md.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 100],
    'subject-case': [0],
  },
}
