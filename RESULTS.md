# Results so far

Judge: `gemini-3-flash-preview`, temperature 0.7 (app default)
Batch: `round 1` — parent + 3 variants from a real Mondrian round, magnitude 5
Data: `data/rows-2026-09-15.csv`, `data/rows-2026-09-17-shuffled.csv`
Scripts: `analyse.js` (per file), `combine.js` (both days)

Winner rule replicates the app's "Best" (deterministic) mode:
`candidates.reduce((best,c) => c.score > best.score ? c : best, candidates[0])`
Strict `>` means the earliest candidate keeps a tie.

## Calls
53 + 40 attempted, **33 succeeded**. Failures were all Google-side:
429 quota (51) and 503 capacity (9). Free tier limits, not app errors.

## Findings

| | |
|---|---|
| Calls where 2+ variants tied for top score | **17 of 33 (52%)** |
| Ties won by the earliest-listed tied variant | **17 of 17** |
| When the critic did not tie, it chose | v3 ×11, v1 ×3, v2 ×2 |
| Winners, variants in generation order (16 calls) | **v1 ×10**, v3 ×6 |
| Winners, variants shuffled (17 calls) | **v3 ×9**, v1 ×4, v2 ×4 |

(Variants numbered 1–3 as in the app; the CSV uses 0–2.)

**Reading:** about half the time the critic cannot separate sibling variants,
and in those calls the app picks whichever variant the Modifier wrote first.
For this batch that made variant 1 the usual winner, although the critic —
whenever it committed to a choice — preferred variant 3 by 11 to 5. Shuffling
the order removed variant 1's advantage and variant 3 became the usual winner.

## Tentative, not yet claimed
Position effect on raw scores in shuffled calls (score minus the picture's own
average): slot 1 −0.26, slot 2 −0.15, slot 3 +0.42, n=17 each. Small, and would
need more calls before it means anything.

## Caveats
- One batch, one taste, one judge model, one temperature.
- The tie-break rule itself is deterministic code. What was measured is how
  often real critic scores produce ties, and what that does to selection.
- Roulette mode gives tied candidates equal odds, so it should not show this bias.

## Bugs found in the hosted app
1. `agentCritique` passes the `CRITIC_SYS` constant, so the editable Critic
   prompt box has no effect. Verified in the live page console:
   `agentCritique.toString().includes('criticPromptEl')` → `false`
   (Modifier and Story return `true`).
2. `callGemini` sends `thinkingLevel:'none'` on Critic calls to non-gemini-2
   models; Gemini 3 Flash rejects it with a 400
   (`Invalid value at 'generation_config.thinking_config.thinking_level'`).

## Next
- Repeat on 2–3 more batches and tastes.
- Test fixes: random tie-break; ask the critic for finer-grained scores or a ranking.
- Add a second judge from another company.

## Counterfactual: random tie-break (no new calls)
Re-applies a different tie rule to the scores already collected (`tiebreak-sim.js`).
Valid because the critic's scores don't depend on how ties are broken afterwards.

Written order only — how the real app presents variants (16 calls):

| tie rule | variant 1 | variant 2 | variant 3 |
|---|---|---|---|
| app's rule (earliest keeps a tie) | 63% | 0% | 38% |
| random tie-break (expected) | 25% | 19% | **56%** |

Random tie-breaking would make the critic's preferred variant (3) the usual
winner instead of variant 1. Same caveats: one batch, 16 calls.

## Decimal scores fix the tie problem (20 Sep)
Same batch, same judge, same written order. Only change: the critic prompt asks
for one decimal place. Data: `data/rows-2026-09-20-decimals.csv`, `compare.js`.

| | integers (app default) | one decimal place |
|---|---|---|
| successful calls | 16 | 14 |
| calls with a tie for top score | 9 (56%) | **0 (0%)** |
| modal winner | variant 1, 63% (first-listed) | **variant 3, 93%** (critic's preference) |
| distinct aesthetic values used | 5 | 21 |
| non-integer scores | 0 of 64 | 54 of 56 |
| variant means | v1 8.66, v2 8.63, v3 9.13 | v1 9.19, v2 9.00, v3 9.51 |

Fisher exact, two-tailed: ties p = 9.4e-4; first-listed variant winning
p = 2.4e-3; critic-preferred variant winning p = 2.4e-3.

Variant 3 has the highest mean under both conditions, so asking for decimals
did not change what the critic prefers — it changed whether that preference
survives into selection.

## Controlled position test (21 Sep)
Same picture (variant 2 of round 1) in all three slots, decimal scores,
gemini-3-flash-preview. Data: `data/rows-2026-09-21-position.csv`.

| | |
|---|---|
| successful calls | 19 |
| calls where all three identical pictures got the same score | **19 of 19** |
| mean score by slot | 9.19 / 9.19 / 9.19 |
| between-call spread of that one picture | SD 0.70, range 7.8 to 10.55 |

**No position effect on scores.** Within a call, the model scored the identical
picture identically every single time. The earlier "+0.26 for later slots"
came from data where picture and slot varied together; the controlled test
does not reproduce it, so that claim is withdrawn.

What the test does show: the same picture's score moves by up to 2.75 points
between calls, even with decimals. Scores are consistent within a call but
drift between calls — comparisons inside one call are reliable, comparisons of
absolute scores across calls are not.

**Revised mechanism, single cause:** coarse integer scores → frequent ties →
the app hands ties to the first-listed variant → generation order decides
selection about half the time. Decimal scores remove the ties.

## Second taste: wild flowers (26 Sep)
Judge `gemini-3.8-flash` (note: not the same judge as the Mondrian runs, so taste
and model both differ — this is not a clean single-variable replication).
Batch made by gemini-3.8-flash. Data: `data/rows-2026-09-26-wildflowers.csv`.
20 calls attempted, 13 succeeded (6 x 503, 1 x 429).

| batch | scale | calls | ties | gap, best to 2nd |
|---|---|---|---|---|
| wild flowers | whole numbers | 6 | **0** | 2.17 |
| wild flowers | decimals | 7 | **0** | 1.51 |
| Mondrian | whole numbers | 16 | **9** | **0.47** |
| Mondrian | decimals | 14 | **0** | 0.33 |

**Ties are not a constant rate — they depend on how far apart the variants are.**
Whole-number aesthetic scores move in steps of 1. When the top two variants sit
closer together than one step, they collide and the tie rule decides; when they
are further apart, no ties occur at all. Decimals raise the resolution enough
that even a 0.33 gap separates.

So the earlier "52% of calls" figure is specific to a batch whose variants were
0.47 apart. The mechanism generalises; the rate does not.

**Prediction this makes, untested:** as an evolution run converges the variants
become more similar, the gaps shrink, and ties — and therefore order deciding
the winner — should become *more* frequent in later rounds. Testable by
recording the gap between the top two variants at round 1 versus round 20.

## Ken's runs (29 Sep) — first non-Google judge
Run by Ken on his own keys. Mondrian batch, written order, app's default scale.
Data: `data/rows-2026-09-29-ken.csv` (gemini-3.8-flash; its 20 OpenAI rows all
failed on the `max_tokens` bug, fixed in commit 304fa29) and
`data/rows-2026-09-29-ken-gpt.csv` (gpt-5.6-terra, after the fix).

| judge | calls | top-score ties | winner (variant 1/2/3) | overall scores v1 / v2 / v3 |
|---|---|---|---|---|
| gemini-3.8-flash | 3 | 2 (both to variant 1) | 3 / 0 / 0 | 9,9,8 / 8,9,8 / 8,8,8 |
| gpt-5.6-terra | 3 | 0 | 0 / 3 / 0 | 6,6.5,5.5 / 6.5,8,6 / 6,6.5,5.5 |

GPT's top-to-second gap was 0.5, 1.5, 0.5. Variants 1 and 3 tied for second in
all three calls. Too few calls to claim anything, but the three judges so far do
not agree on the best variant: gemini-3-flash-preview preferred variant 3,
gpt-5.6-terra variant 2, and gemini-3.8-flash tied or chose variant 1.

## Ken's three-judge run (30 Sep)
Experiment 4, run by Ken, 10 calls per judge per batch, whole-number prompt,
written order. Data: `data/rows-2026-09-30-ken-3judges.csv`. Claude failed on
Mondrian (model typed as `sonnet-5.5`, 404) and worked on wild flowers
(`claude-sonnet-5`).

| batch | judge | calls | top-score ties | winner v1 / v2 / v3 |
|---|---|---|---|---|
| Mondrian | gemini-3.8-flash | 10 | **10** | 10 / 0 / 0 |
| Mondrian | gpt-5.6-luna | 10 | 1 | 0 / 8 / 2 |
| Wild flowers | gemini-3.8-flash | 10 | 0 | 10 / 0 / 0 |
| Wild flowers | gpt-5.6-luna | 10 | 0 | 9 / 1 / 0 |
| Wild flowers | claude-sonnet-5 | 10 | 0 | 10 / 0 / 0 |

- **Mondrian, gemini-3.8-flash: a tie in every one of 10 calls**, all won by the
  first-listed variant. Here list order chose every winner.
- GPT scores in half-points and tied once; it preferred variant 2, 8 of 10.
- **Wild flowers: all three companies agree** — variant 1, 29 of 30 calls, no
  ties. Where the variants are far apart the judges agree and ties vanish; where
  they are close (Mondrian) one judge ties every time and the judges disagree.
  Consistent with the gap rule, now across two companies' models plus Claude on
  one batch.

## Close vs far: the gap rule tested on purpose (30 Sep)
Experiment 5, run by Ken. Six hand-written batches (three tastes, each a close
set of near-identical variants and a far set with the strongest listed last).
Judge gemini-3.8-flash, 10 calls per batch, whole-number prompt, written order.
Data: `data/rows-2026-09-30-ken-closefar.csv`. The OpenAI rows all failed (model
typed as `gpt-5.5-luna`, which does not exist) and the Claude rows all failed
(Anthropic account out of credit), so this is one judge only.

| batch | calls | top-score ties | winner v1 / v2 / v3 | mean gap, best to 2nd |
|---|---|---|---|---|
| Snowflake - close | 10 | **10** | 10 / 0 / 0 | 0.00 |
| City skyline - close | 10 | **7** | 10 / 0 / 0 | 0.25 |
| Spiral galaxy - close | 10 | **7** | 7 / 0 / 3 | 0.30 |
| Snowflake - far | 10 | 0 | 0 / 0 / **10** | 2.05 |
| City skyline - far | 10 | 0 | 0 / 0 / **10** | 5.40 |
| Spiral galaxy - far | 10 | 0 | 0 / 0 / **10** | 1.70 |

- **Close sets: ties in 24 of 30 calls. Far sets: 0 of 30.** Fisher exact,
  two-tailed, p = 3.3e-11.
- On close sets the first-listed variant won 27 of 30. On far sets the
  strongest variant won 30 of 30 **from last place**, so when the gap is large
  the critic's judgement, not list order, decides.
- The gap rule now holds across five tastes on this judge: ties appear when the
  variants are close and vanish when they are far apart.
- Caveat: the batches were designed by hand to be close or far, so this tests
  the mechanism, not how often real evolved batches are close. One judge.

## Close vs far, second company (1 Oct)
Ken re-ran experiment 5 with gpt-5.6-luna, 10 calls per batch, all succeeded.
Data: `data/rows-2026-10-01-ken-closefar-gpt.csv`.

| batch | calls | top-score ties | winner v1 / v2 / v3 | mean gap, best to 2nd |
|---|---|---|---|---|
| Snowflake - close | 10 | **8** | 10 / 0 / 0 | 0.10 |
| City skyline - close | 10 | **6** | 10 / 0 / 0 | 0.40 |
| Spiral galaxy - close | 10 | **8** | 8 / 2 / 0 | 0.20 |
| Snowflake - far | 10 | 0 | 0 / 0 / **10** | 2.85 |
| City skyline - far | 10 | 0 | 0 / 0 / **10** | 9.95 |
| Spiral galaxy - far | 10 | 0 | 0 / 0 / **10** | 2.15 |

- GPT: ties in **22 of 30** close calls and **0 of 30** far calls (Fisher exact
  p = 8.3e-10). First-listed variant won 28 of 30 close calls; the strongest
  variant won 30 of 30 far calls from last place.
- Same pattern as gemini-3.8-flash (24 of 30 vs 0 of 30). Both judges together:
  ties in 46 of 60 close calls, 0 of 60 far calls.
- So the gap rule is not particular to Google's models. Note that GPT scores in
  half-points and still ties when the variants are near-identical.
