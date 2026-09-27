# Experiments to run

Open `judge-lab.html` in a browser (or host it anywhere static). Click the
purple **Judge Lab** button, bottom right.

Two frozen batches are built in, so nothing needs pasting:

- **Mondrian (round 1)** — parent plus three variants whose top two scored
  0.47 apart. This is the batch where ties happened.
- **Wild flowers (round 1)** — top two scored 2.17 apart. No ties at all.

Both store their rendered images, so every run scores pixel-identical pictures.

## Setting up a judge

In section 2, each row is one judge: provider, model, API key. The key box can
stay empty for Gemini or OpenAI if a key is already in the app's own
API PROVIDER panel. Add a row per model you want to compare.

Set **delay ms** to suit your rate limits — 1000 is fine on a paid tier.

Provider notes:

- **Gemini** and **OpenAI** — key in the judge row, or leave it empty to use the
  key in the app own API PROVIDER panel.
- **Claude** — put an Anthropic API key in that judge row key box. Without a key
  it only works inside a Claude artifact, not on a normal web page.
- The free Gemini tier refused most of my calls for days (51 quota, 9 capacity
  out of 93). On a paid tier none of that should bite.

## The four experiments

Pick one from the dropdown in section 3 and press **Run this experiment**. The
description under the dropdown says what it tests and roughly how many calls it
spends. Afterwards press **Export CSV**.

**1. Tie rate on both tastes** (~40 calls). The main claim: ties depend on how
far apart the variants are, not on some fixed rate. Expect many ties on Mondrian
and none on wild flowers.

**2. Does the decimal fix hold on both tastes?** (~80 calls). Runs whole numbers
then decimals on both batches. Expect ties to disappear wherever they occurred,
and the winner to switch to whichever variant the critic actually scores highest.

**3. Does list order decide the winner?** (~40 calls). Twenty calls in written
order, twenty shuffled, on the Mondrian batch. Expect the first-listed variant
to lose its advantage when shuffled.

**4. Same pictures, every judge you have** (10 calls per judge per batch). This
is the one I could not run at all. It asks whether any of this is particular to
one company. Add a Gemini row, an OpenAI row and a Claude row, then run.

## The prediction I could not test

As a run converges the variants get more alike, so the gap between the best two
shrinks. If ties happen when that gap is below one step of the scale, then ties —
and order deciding the winner — should get **more** common in later rounds.

To test it: run the app normally for 20 or 30 rounds on any taste, then press
**Gap report from the app rounds** in the Judge Lab panel. It reads the app's own
history and writes a CSV with, for each round, the best and second-best variant
scores, the gap, and whether they tied. It also prints the mean gap in the first
half of the run versus the second.

If the gap shrinks and ties become more frequent, the bias is worst exactly when
the evolution is meant to be doing its most delicate work.

## Reading the results

The panel splits results by batch, judge and scoring style, and reports:

- mean, SD, min and max for each picture — how much an identical picture's score
  moves between calls
- the winner and how often it changed
- an orange line whenever there were ties, and which variant they went to
- a position effect table, if the order was shuffled

For anything more, export the CSV and use the scripts in `scripts/`:
`analyse.js` for one file, `compare.js` for whole numbers versus decimals,
`stats.js` for significance and sample size, `tiebreak-sim.js` for what a random
tie-break would have done.

## What I found, in one line each

- The critic gave two or more variants the same top score in 17 of 33 calls on
  the Mondrian batch, and in 0 of 13 on wild flowers.
- Every tie went to whichever variant was listed first, because `selectWinner`
  keeps the incumbent on a tie.
- With variants in written order, variant 1 won 10 of 16; shuffled, variant 3
  won 9 of 17 (Fisher exact p = 0.037).
- Asking for one decimal place took ties from 9 of 16 to 0 of 14 (p = 0.0009),
  and the winner became the variant the critic actually preferred, 93% of calls.
- Showing the same picture in all three slots produced identical scores in 19 of
  19 calls, so there is no position effect on the scores themselves.
