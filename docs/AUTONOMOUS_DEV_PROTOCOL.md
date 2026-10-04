# Autonomous Development Protocol

## 1. Operating model

Claude Code acts as the Supervisor.

DeepSeek-Flash is the model behind the Claude Code development harness.

Claude Code may create multiple internal subagents if supported.

The user does not participate in routine implementation decisions.

## 2. Supervisor responsibilities

Supervisor:
- owns the complete specification;
- creates and updates the task DAG;
- chooses technical details within this spec;
- delegates work;
- minimizes subagent context;
- reviews all returned code;
- resolves integration conflicts;
- runs tests;
- diagnoses failures;
- repairs failures;
- creates local commits;
- advances phases automatically.

Supervisor MUST NOT implement policy by repeatedly asking the user what to do next.

## 3. Subagent responsibilities

A subagent receives only:
- its task goal;
- necessary interfaces/contracts;
- relevant files;
- acceptance tests.

A subagent does not:
- rewrite project scope;
- modify unrelated architecture;
- push Git changes;
- create PRs;
- ask the user questions.

If blocked, it returns:
- exact blocker;
- evidence;
- attempted fixes;
- recommended next action to Supervisor.

Supervisor decides.

## 4. Parallelism

Parallelize only tasks whose file ownership and contracts are sufficiently independent.

Good parallel examples:
- Vision worker implementation
- Procedural guitar synthesis
- UI shell
- Music theory utilities
- JSON schema/tests

Avoid parallel edits to the same core file unless Supervisor explicitly coordinates interfaces first.

## 5. No-human-progress rule

The system must not stop for:
- library choice;
- UI styling details;
- exact threshold selection;
- sample asset availability;
- code organization details;
- failed tests that can be debugged;
- browser API quirks with viable fallbacks;
- minor dependency incompatibilities.

Make a decision, document it, continue.

## 6. External blocker policy

Only stop if no software workaround exists for a required acceptance item, e.g.:
- no camera hardware exists to perform a final real-camera smoke test;
- OS policy physically prevents camera/mic access;
- browser installation itself is impossible.

Even then:
1. finish all simulatable work;
2. create automated tests/mocks;
3. document the one remaining manual hardware verification;
4. do not block unrelated features.

## 7. Audio-source policy

External guitar samples are never required.

If usable redistributable samples are not readily available:
- implement the procedural plucked-string engine;
- tune it;
- pass acceptance with it;
- leave sample engine behind an interface.

No permission to stop or ask the user.

## 8. Local commit policy

Commit only after:
- relevant unit tests pass;
- typecheck passes for touched scope;
- lint passes or known issue is documented;
- Supervisor reviews diff.

Never push.

## 9. Evidence log

Maintain a local `DEVELOPMENT_LOG.md` containing:
- phase
- key decisions
- commands run
- test summary
- performance measurements
- known limitations
- commit hash

## 10. Completion

The goal is complete only when:
- all mandatory acceptance criteria pass;
- build succeeds;
- application runs locally;
- keyboard simulation proves end-to-end logic;
- camera/microphone paths are implemented;
- automated tests pass;
- remaining limitations are non-blocking and documented.
