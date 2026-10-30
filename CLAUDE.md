@AGENTS.md

## Fork note: mobile is on its way out

This fork plans to remove the mobile app (`apps/mobile` and what only it uses) later, in one deliberate change. Until then:

- Do not build mobile features, fixes, tests or parity work. In "Hit every surface", mobile's answer is "not supported in this fork".
- Do not run `test-t3-mobile`, `mobile:install` or other mobile builds, and do not fix mobile typecheck or test failures that fork changes cause.
- Do not delete mobile code piecemeal either. In upstream syncs, take upstream's version of `apps/mobile` files.
