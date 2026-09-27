# Judge Lab — testing the critic in the Logo Turtle Program Evolution Lab

A copy of [Ken Kahn's Logo Evolution Lab](https://toontalk.github.io/AI/apps/logo-evolution-lab.html)
with a panel added for measuring the critic itself: does it give the same
picture the same score twice, and does that matter for which variant wins?

**Start here: [EXPERIMENTS.md](EXPERIMENTS.md)** — how to run each experiment in
one click. **[RESULTS.md](RESULTS.md)** has everything found so far, with the
numbers.

## The short version

On one batch of three evolved Mondrian variants, scored 33 times by
`gemini-3-flash-preview`:

- the critic gave two or more variants **the same top score in 17 of 33 calls**
- every one of those ties went to whichever variant was **listed first**, because
  `selectWinner` keeps the incumbent when scores are equal
- in written order variant 1 won 10 of 16 calls; shuffled, variant 3 won 9 of 17
  (Fisher exact, p = 0.037)
- adding one sentence to the critic prompt asking for **one decimal place** took
  ties from 9 of 16 to **0 of 14** (p = 0.0009), after which the winner was the
  variant the critic actually scored highest, in 93% of calls

A second taste, wild flowers, produced **no ties at all** — its top two variants
were 2.17 apart, against 0.47 for the Mondrian batch. So ties are not a fixed
rate: they happen when variants sit closer together than the score scale can
separate. Whole-number scores move in steps of 1.

## Files

| | |
|---|---|
| `judge-lab.html` | the app: Ken's original plus the Judge Lab panel, two frozen batches built in |
| `logo-evolution-lab-ORIGINAL.html` | his file as downloaded, for diffing |
| `EXPERIMENTS.md` | the experiments, one click each |
| `RESULTS.md` | findings, with data and methods |
| `data/` | every call ever made, including failures, plus the frozen batches |
| `scripts/` | analysis, the two source modules, the build script, tests |

## Changes to the original

`scripts/inject.js` rebuilds `judge-lab.html` from the original plus the two
modules, and documents every change. There are five:

1. **Bug fix.** `agentCritique` passed the `CRITIC_SYS` constant, so the editable
   Critic prompt box had no effect. The Modifier and Story prompts were wired up
   correctly; only the Critic was not.
2. **Bug fix.** `callGemini` sent `thinkingLevel:'none'` on Critic calls to any
   non-`gemini-2` model. Gemini 3 models now reject it with a 400, which breaks
   scoring for the default model.
3. Newer Gemini Flash models added to the dropdown.
4. A stray line of JavaScript inside the closing `</html>` tag tidied away.
5. The Judge Lab panel added before `</body>`.

Run `node scripts/test-core.js` for the 31 unit tests on the analysis maths, and
`node scripts/inject.js` to rebuild.

## Running it

Open `judge-lab.html` in a browser. For a local server:

    cp scripts/serve.js . && node serve.js     # then http://localhost:8731/judge-lab.html
