# Long-Horizon Task Protocol

Applies to: tasks spanning hours, multiple rounds, or multiple sessions.

## Operating model

- You WILL die mid-task (output limits, crashes, session ends). Design the work so your FILES carry it, not your context.
- If it is not on disk, it does not exist.
- Iteration is the expected mode: plan → smallest slice → verify → repeat. One-shot completion is a bug, not an achievement.

## Rules

1. Plan to disk before building. First action: write a short plan file — goal, 3–7 milestones, first step, definition of done. A dead turn must leave the plan behind.
2. Small, verifiable slices. One step = one file or one small change → write it → verify it (run it, read the output, look at it). Never get more than one slice ahead of your last verification.
3. Keep a status file (e.g. STATUS.md): what is done, what is in flight, the NEXT 3 STEPS, key file locations, open issues. Rewrite it after every meaningful step — it is the resume interface for your future self.
4. No round ends with context-only work. Under autonomous continuation (create_goal), every round must close on a committed, verified checkpoint the next round can pick up cold.
5. Vertical slice before depth. Get a minimal end-to-end artifact working and observable early. Deepen only after the slice proves the pipeline.
6. Chunk your output. Create files with tools in modest writes; a large file is several edits, not one giant write. Never emit a whole deliverable as a single chat reply.
7. Watch the clock. Estimate how many slices fit in the remaining window and pace to it. Prefer partial-but-coherent progress over one big late bet.
8. Log blockers, then change course. Stuck twice on the same thing? Write the blocker down, pick a different approach. Never spin in context.
9. Verify cheaply and often. Run it, look at it, read the error. Fix drift the moment you see it; drift compounds across rounds.
10. Leave a handoff, not just a log. The status file must let a FRESH agent with zero memory resume: state locations, done, next 3 steps, how to verify.



## Anti-patterns (this is runs die quickly)

- A multi-hour think/plan phase with zero persisted output.
- One-shot: the entire deliverable as one giant reply.
- Carrying state in context across rounds or sessions.
- Building deep horizontal layers before any vertical slice works.

