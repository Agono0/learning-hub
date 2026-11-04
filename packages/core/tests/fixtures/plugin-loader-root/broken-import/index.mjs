/**
 * Loader fixture — import always fails (package does not exist). The loader
 * must log the failure and continue with the sibling plugins.
 */
import 'this-package-does-not-exist-xyz'

export default {
  name: 'fixture-broken',
  version: '9.9.9',
  setup() {},
}
