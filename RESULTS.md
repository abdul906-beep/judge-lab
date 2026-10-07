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

## Evolution: original app vs enhanced (2 Oct)
First multi-round test, run by Ken with "Compare evolution". Modifier and critic
gpt-5.4, taste "Mathematical beauty where simple rules generate complexity",
start `FD 100`, 3 variants per round, magnitude 5, Best mode, 10 rounds, 2 runs
of each version. Enhanced = decimal critic scores + random tie-break.
Data: `data/evolution-2026-10-02-ken.csv` (one row per round),
`data/rows-2026-10-02-ken-evo-finals.csv` (final judging, plus a 20-call
experiment 4 with gpt-5.6-terra), `data/history-2026-10-02-ken.html` (the app's
own history export).

| | original | enhanced |
|---|---|---|
| rounds | 20 | 20 |
| rounds with a tie for top score | **4** | **1** |
| ties won by the first-listed candidate | 4 of 4 | 0 of 1 |
| rounds where a tie kept the parent (no progress) | 1 | 0 |
| ties, rounds 1-5 / rounds 6-10 | 2 / 2 | 0 / 1 |
| mean gap, rounds 1-5 / rounds 6-10 | 1.30 / 0.70 | 0.75 / 0.45 |

Final pictures, judged together by gpt-5.6-terra, 10 calls, shuffled order,
decimals:

| final picture | mean aesthetic | best in |
|---|---|---|
| original, run 1 | 8.99 | 10 of 10 calls |
| enhanced, run 2 | 7.82 | 0 |
| original, run 2 | 6.89 | 0 |
| enhanced, run 1 | 6.22 | 0 |

What this does and does not show:

- **The mechanism appears in real evolution.** In the original app 4 of 20 rounds
  tied and every tie went to the first-listed candidate. In one of them (run 2,
  round 2: parent 9, variants 8.5 / 9 / 9) the first-listed candidate was the
  parent, so the app kept the parent and the round produced nothing.
- **The enhancements cut ties from 4 to 1 of 20**, but that difference is not
  significant on 20 rounds each (Fisher exact p = 0.34). The one remaining tie
  (11.2 / 11.2) shows decimals reduce ties rather than remove them; the random
  tie-break handled it.
- **No evidence the enhancements gave better final pictures.** The best final
  picture came from the original app, and the two runs of the same version
  differed more (8.99 vs 6.89) than the two versions did on average (original
  7.94, enhanced 7.02). With two runs each, run-to-run luck dominates.
- **Ties were not more common later** (2 early, 2 late). The gap between the top
  two did shrink in the second half in both versions, as predicted, but over 10
  rounds that did not turn into more ties.
- The tie rate here (20%) is well below the Mondrian batch (52%): gpt-5.4 as
  critic spreads its scores more, and half-point totals separate more variants.
- Side note: in the same file, gpt-5.6-terra on experiment 4 gave no ties in 20
  Mondrian calls (variants 2 and 3 won 10 each) and none in 20 wild flowers calls.

Needed next: more runs per version (the run-to-run spread says roughly 10+), and
a critic that ties more often (gemini-3.8-flash tied in 10 of 10 on Mondrian),
where the enhancements have more to fix.

## Evolution: original vs enhanced, six runs on the tie-prone critic (5 Oct)
Run by me through OpenRouter (key from Ken). Modifier and critic
google/gemini-3.8-flash, taste "Mondrian", start `FD 100`, 3 variants per round,
magnitude 5, Best mode, 10 rounds, **6 runs of each version** (120 rounds, about
250 calls, roughly $1.75). Enhanced = decimal critic scores + random tie-break.
Data: `data/evolution-2026-10-05-mondrian-g38.csv`,
`data/rows-2026-10-05-evo-finals-g38.csv` (the 12:57 batch is the real run; the
12:11 batch is a 2-round smoke test).

| | original | enhanced |
|---|---|---|
| rounds | 60 | 60 |
| rounds with a tie for top score | **10** | **1** |
| ties won by the first-listed candidate | 10 of 10 | 1 of 1 (by chance) |
| ties that kept the parent (round wasted) | 1 | 0 |
| ties, rounds 1-5 / rounds 6-10 | 5 / 5 | 0 / 1 |
| mean gap, rounds 1-5 / rounds 6-10 | 1.15 / 0.75 | 1.07 / 0.63 |
| critic replies with decimals | 0 of 60 | 60 of 60 |

Ties: Fisher exact, two-tailed, **p = 0.008**. With Ken's 2 Oct run added:
14 of 80 original rounds against 2 of 80 enhanced, p = 0.003.

Final pictures: all 12 judged together by gemini-3.8-flash, 10 calls, shuffled
order, decimals.

| | original | enhanced |
|---|---|---|
| mean aesthetic of the 6 final pictures | 5.83 | 5.68 |
| range | 5.06 to 6.88 | 4.29 to 6.79 |
| judged best picture | 8 of 10 calls (run 2) | 2 of 10 calls (run 3) |

Exact permutation test on the two means: p = 0.75. Enhanced minus original, run
by run: +0.93, -2.08, +0.75, -1.36, +0.04, +0.80.

What this shows:

- **The enhancements do what they were built for.** Ties fell from 10 of 60
  rounds to 1 of 60, and that is now significant. Every tie in the original app
  went to the first-listed candidate; one of them was the parent (run 6, round 4,
  parent 7 against 7 / 7 / 7), so that round changed nothing.
- **They did not make the final pictures better.** 5.83 against 5.68 with p = 0.75
  is no difference; three runs favoured each side. The earlier hypothesis, that
  ties are part of why evolution underperforms, is **not supported** by this.
- **Why not, probably:** in real evolution the original app ties in about 1
  round in 6, not the 1 in 2 seen on the frozen Mondrian batch, so list order
  decides far fewer rounds than that batch suggested. And when two variants tie
  they are close in quality anyway, so picking the "wrong" one costs little.
- **Ties did not become more common later** (5 early, 5 late), although the gap
  between the top two shrank in the second half in both versions, as predicted.
  That prediction is not supported over 10 rounds.
- **Progress stalls early in both versions.** The parent's aesthetic score rises
  from about 4.2 at round 2 to about 6 by round 5 and then stays there (original
  6.2, 6.2, 6.2, 6.0, 6.0; enhanced 6.5, 6.3, 5.8, 5.8). Whatever limits the
  evolution after round 5, it is not tie-breaking. Scores from different calls
  drift, so this is suggestive only.
- Caveats: one taste, one model as both modifier and critic, 10 rounds, and the
  same model judged the finals.

## Seven tastes, small runs (6 Oct)
Ken's suggestion: vary the difficulty of the goal, and do small experiments
before big ones. Modifier, critic and final judge google/gemini-3.8-flash via
OpenRouter, start `FD 100`, 3 variants, magnitude 5, 6 rounds, 2 runs of each
version per taste (168 rounds, about $2.40). Data:
`data/evolution-2026-10-06-seven-tastes.csv`,
`data/rows-2026-10-06-seven-tastes-finals.csv`.

| taste | ties, original | ties, enhanced | mean gap, original | final aesthetic, orig / enh |
|---|---|---|---|---|
| A single red circle | **5 of 12** | 0 of 12 | 0.75 | 7.01 / 5.31 |
| A five-pointed star | **4 of 12** | 0 of 12 | 0.79 | 6.69 / 6.52 |
| A snowflake | 1 of 12 | 1 of 12 | 1.13 | 6.91 / 6.49 |
| Mondrian | 1 of 12 | 0 of 12 | 1.00 | 5.26 / 6.86 |
| A field of wild flowers | **5 of 12** | 0 of 12 | 0.71 | 6.44 / 5.86 |
| A city skyline at night | 1 of 12 | 0 of 12 | 1.79 | 6.32 / 5.85 |
| Mathematical beauty... | 0 of 12 | 0 of 12 | 1.21 | 5.90 / 6.21 |
| **all** | **17 of 84** | **1 of 84** | | 6.36 / 6.16 |

- **Ties again fall with the enhancements:** 17 of 84 rounds against 1 of 84,
  Fisher exact p = 6.5e-5. All 17 went to the first-listed candidate; in 2 of
  them that was the parent, so the round was wasted.
- **Ties depend on the taste, but not simply on difficulty.** The two simplest
  goals (circle, star) tied a lot, and so did wild flowers; the open-ended goal
  (mathematical beauty) never tied. What does line up is the gap: the three
  tastes with the smallest mean gap between the top two (0.71, 0.75, 0.79) had
  14 of the 17 ties, and the four with gaps of 1.0 or more had 3 (14 of 36
  rounds against 3 of 48, p = 3.0e-4; rank correlation between gap and ties
  -0.88 over seven tastes). The gap rule from the frozen batches holds in live
  evolution. A plausible reading: with a simple, concrete goal several variants
  satisfy it equally (scores like 10 / 10 / 10), so the critic cannot separate them.
- **Still no gain in the final pictures.** Enhanced minus original over the 14
  taste-and-run pairs averages -0.20, positive in 4 of 14, sign-flip p = 0.56.
  Single tastes swing both ways (Mondrian +1.6, red circle -1.7), which with two
  runs each is noise.
- Ties per round in the original, rounds 1 to 6: 4, 2, 1, 4, 4, 2 (of 14 each).
  No trend. Four ties came in round 1, where every variant is very different
  from `FD 100` and they score alike.
- **The plateau shows up on every taste.** The parent's aesthetic score reaches
  about 6 by round 3 or 4 and stays there, easy goal or hard. And in 4 enhanced
  rounds (all late, all on wild flowers or city skyline) no variant beat the
  parent at all (for example parent 7.1 against 6.3 / 6.1 / 6.15), so the parent
  was kept without any tie. On hard goals the modifier's variants stop being
  improvements.
- Pooled with the 5 Oct run: 27 of 144 original rounds tied, 2 of 144 enhanced.
- Caveats: 2 runs per taste, so the per-taste rows are a survey, not results;
  one model in every role.

## How big is each step? (6 Oct, no new calls)
Prompted by a chat Ken shared, which predicts that when the critic and the
generator share a prior, lineages narrow quickly. `step-size.js` compares each
round's winning program with the previous round's (token edit distance divided
by the longer program's length), over data already collected.

Share of the program changed, by round (original version; enhanced is the same
within noise):

| run set | r1 | r2 | r3 | r4 | r5 | r6 | r7 | r8 | r9 | r10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Mondrian, 6 runs (5 Oct) | 0.96 | 0.75 | 0.58 | 0.31 | 0.32 | 0.32 | 0.35 | 0.28 | 0.33 | 0.35 |
| seven tastes, 14 runs (6 Oct) | 0.95 | 0.65 | 0.53 | 0.41 | 0.34 | 0.39 | | | | |

- **Steps shrink fast and then stay small.** Round 1 rewrites the whole program,
  round 2 about 70% of it, round 3 just over half, and from round 4 on each round
  changes about a third. That is the same round at which the parent's aesthetic
  score stops rising. The critic's own novelty score for the winner falls in
  step, from about 6.5 to about 5.
- Programs keep growing while this happens (Mondrian: 64 tokens at round 1, about
  160 by round 7), so later rounds add detail to one design rather than trying
  another.
- The enhancements make no difference to any of this, which fits their making
  no difference to the final pictures.
- Different runs do not end in the same place: final programs from different
  runs of the same taste differ by 0.7 to 0.9 on the same measure. So the
  narrowing is within a lineage, not towards one house style, at least as far
  as program text can show.
- Limits: this measures program text, not pictures. Two different programs can
  draw similar pictures, and one changed number can change a picture a lot.

## Ranking instead of scoring (7 Oct)
Experiment 6: the critic orders the pictures best to worst, no ties allowed,
variants in a fresh random order every call. Judge google/gemini-3.8-flash via
OpenRouter, 10 calls per batch, 80 of 80 succeeded.
Data: `data/rows-2026-10-07-ranking.csv`.

| batch | ranked first, by variant (1 / 2 / 3) | ranked first, by slot shown in (1 / 2 / 3) |
|---|---|---|
| Snowflake - far | 0 / 0 / **10** | 6 / 1 / 3 |
| City skyline - far | 0 / 0 / **10** | 6 / 2 / 2 |
| Spiral galaxy - far | 0 / 0 / **10** | 3 / 3 / 4 |
| Spiral galaxy - close | 0 / 1 / **9** | 2 / 3 / 5 |
| City skyline - close | 3 / 0 / **7** | 4 / 3 / 3 |
| Wild flowers | **8** / 2 / 0 | 6 / 4 / 0 |
| Snowflake - close | 3 / 4 / 3 | **7** / 3 / 0 |
| Mondrian | 2 / 3 / 5 | **10** / 0 / 0 |

- **Where one picture is clearly best, ranking finds it:** the strongest variant
  came first in 30 of 30 far-set calls, wherever it was shown.
- **Ranking shows preferences the scores hid.** On the spiral galaxy close set
  the scoring critic tied in 7 of 10 calls; made to rank, it put variant 3 first
  in 9 of 10, in every slot. City skyline close is similar (variant 3, 7 of 10).
  So some "ties" were real preferences lost to a coarse scale.
- **Where it cannot tell the pictures apart, it picks whichever it is shown
  first.** On Mondrian the first-ranked picture was the one in slot 1 in 10 of
  10 calls, while the variant in that slot changed (chance of that: 1.7e-5).
  Snowflake close: slot 1 in 7 of 10. Over those two batches slot 1 won 17 of
  20 (p = 4e-6 against one in three).
- **So a ranking critic does not remove the order problem, it hides it.** The
  scoring critic says "these are equal" (a visible tie, and no position effect
  on its scores: 19 of 19 in the 21 Sep test); the app then breaks the tie by
  order. The ranking critic is not allowed to say "equal", so it breaks the tie
  itself, by order, and reports it as a preference. Without shuffling the
  first-written variant would win exactly as before, with nothing in the output
  to show it.
- Shuffling the order each call turns that into a fair random pick, which is
  what the evolution switch does. In effect ranking plus shuffling behaves like
  decimals plus a random tie-break: it follows a real preference where there is
  one and chooses at random where there is not.
- Caveats: one judge, 10 calls per batch, ranking of four images in one call
  rather than separate pairwise calls.
