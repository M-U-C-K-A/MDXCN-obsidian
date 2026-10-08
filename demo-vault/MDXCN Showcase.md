Every block below is plain text in this note. Switch between Reading view and Live Preview: they render the same. Hover a figure and click ⧉ to copy it back as ASCII for GitHub, Notion or Linear.

## 1 · Paste the official ASCII

Straight from mdxcn.dev, inside an `mdx` fence:

```mdx
+------------------- [ LAUNCH ] -------------------+
|                                                  |
| design  ████████----------------                 |
| build   -----███████░░░░░░------                 |
| docs    -------------██░░░░░░░--                 |
| ship    --------------------████                 |
|         q1     q2      q3     q4                 |
|                                                  |
+--------------------------------------------------+
```

A plain fence with no language works too (setting: *Render plain fences*):

```
+----------------- [ INCIDENT ] -----------------+
|                                                |
| 2026-08-27T08:00:00Z — api                     |
|                                                |
+------------------------------------------------+
```

## 2 · Comark: YAML props + Markdown children

```mdx
::graph-gantt
---
title: LAUNCH
progress: 0.58
ticks: [q1, q2, q3, q4]
---
- design: 0 0.35
- **build: 0.2 0.75 0.55**
- docs: 0.55 0.9 0.2
- ship: 0.85 1 0
::
```

## 3 · MDX tags

```mdx
<GraphTimeline title="NIGHT">

- 14:02: p95 crossed 800ms — paged the on-call
- **14:11: rolled back the cache flag**
- *14:40: write the postmortem*

</GraphTimeline>
```

## 4 · Short form: the info string names the graph

```mdx countdown
---
title: FREEZE
done: open
---
2027-01-01T00:00:00Z — until launch
```

## 5 · Side by side

```mdx
::row{cols=2}
::graph-stat{title="THIS WEEK"}
- 12,400 docs
- **860** shipped
::
::graph-meter{title="SHIPPED"}
67% — characters, not a progress bar
::
::
```

## 6 · A few more

```mdx
::graph-check{title="LAUNCH"}
- [x] freeze tokens
- [x] ship registry json
- [ ] write the postmortem — still open
::
```

```mdx
::graph-heatmap
---
title: DEPLOYS
palette: duo
---
| | 0 | 4 | 8 | 12 | 16 | 20 |
| --- | --- | --- | --- | --- | --- | --- |
| Mon | 0 | 1 | 4 | 8 | 6 | 1 |
| Tue | 0 | 0 | 5 | 9 | 4 | 2 |
| Wed | 1 | 0 | 6 | 12 | 5 | 1 |
::
```

```mdx
::decision
---
title: DATABASE
status: accepted
date: Mar 12
---
- **Postgres** — we already run it
- *Mongo* — no joins we trust
- SQLite — fine until the second writer

Revisit if writes pass 2k a second.
::
```

Type `::` at the start of a line to insert any component (`::gantt`, `::timer`…), use the slash command `/Insert Gantt`, or click the ribbon icon to open the picker.
