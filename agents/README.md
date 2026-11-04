# agents

Owner: Adam. Each agent file also names that agent's human owner.

What goes here: one file per agent, named after its label without "agent:", for example chief-of-staff.md. Each file says the agent's job, its human owner, what it may do, what it must never do, and how it reports.

Planned agents and their human owners: chief-of-staff (Adam), design (Adam), engineer (Adam), reviewer (Adam), research (Melvin), sales (Adam).

Every agent follows CLAUDE.md first. An agent file can add limits but never remove a CLAUDE.md rule.

Starting point: the agent files in the starter kit claims-expert-ai-env.zip (.claude/agents/). Adapt them before use: here, work comes from GitHub Issues with the agent's label (not the Paperclip board), and the stop file is PAUSE (not .pause_all).
