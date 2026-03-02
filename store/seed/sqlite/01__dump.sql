-- Demo User (Admin) — password: demo
INSERT INTO user (id,username,role,nickname,password_hash) VALUES(1,'demo','ADMIN','Demo User','$2a$10$c.slEVgf5b/3BnAWlLb/vOu7VVSOKJ4ljwMe9xzlx9IhKnvAsJYM6');

-- Alice (User) — password: demo
INSERT INTO user (id,username,role,nickname,description,password_hash) VALUES(2,'alice','USER','Alice','Developer & avid reader 📚','$2a$10$c.slEVgf5b/3BnAWlLb/vOu7VVSOKJ4ljwMe9xzlx9IhKnvAsJYM6');

-- 1. Welcome Memo (Pinned)
INSERT INTO memo (id,uid,creator_id,content,visibility,pinned,payload) VALUES(1,'welcome2memos001',1,replace('# Welcome to Memos!\n\nA privacy-first, lightweight note-taking service. Capture thoughts, build knowledge, stay organized.\n\n## Key Features\n\n- **Write anything**: Quick notes, long-form writing, technical docs\n- **Markdown**: Full CommonMark + GFM syntax\n- **Task Lists**: Track to-dos inline with `- [ ]` syntax\n- **Tags**: Use #hashtags to organize your memos\n- **Attachments**: Images, videos, documents — drag & drop\n- **Location**: Geotag memos to remember where ideas struck\n- **Reactions & Comments**: Engage with any memo\n- **Relations**: Connect and reference related memos\n\n---\n\nExplore the demo memos below to see what''s possible! #welcome #getting-started','\n',char(10)),'PUBLIC',1,'{"tags":["welcome","getting-started"],"property":{"hasLink":false}}');

-- 2. Sponsor Memo (Pinned)
INSERT INTO memo (id,uid,creator_id,content,visibility,pinned,payload) VALUES(2,'sponsor0000001',1,replace('**[Warp](https://go.warp.dev/memos)**: A modern terminal reimagined to work with AI, helping developers build faster and more efficiently.\n\n[![Warp](https://raw.githubusercontent.com/warpdotdev/brand-assets/main/Github/Sponsor/Warp-Github-LG-02.png)](https://go.warp.dev/memos)\n\n#sponsor','\n',char(10)),'PUBLIC',1,'{"tags":["sponsor"],"property":{"hasLink":true}}');

-- 3. AI Skills — boojack/skills workflow, references the example definition doc
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(3,'aiskillsrepo001',1,replace('Been diving into AI agent programming lately — trying to figure out how to make AI actually reliable for complex dev tasks.\n\nThe core problem I keep running into: AI starts writing code before it fully understands the problem, then goes off in the wrong direction. The fix is surprisingly simple — force it through a pipeline: define the issue first, then design, then plan, then execute. Each stage has a concrete artifact, so there''s no room to skip ahead.\n\n**[boojack/skills](https://github.com/boojack/skills)** packages exactly this into four slash commands — `/defining-issues`, `/writing-designs`, `/planning-tasks`, `/executing-tasks` — that work with Claude Code, Cursor, Gemini CLI, and more.\n\n```bash\nnpx skills add boojack/skills\n```\n\n> 📄 Linked below: an example issue definition generated with `/defining-issues`.\n\n#ai #programming','\n',char(10)),'PUBLIC','{"tags":["ai","programming"],"property":{"hasLink":true,"hasCode":true},"location":{"placeholder":"San Francisco, California, United States","latitude":37.7749,"longitude":-122.4194}}');

-- 4. Example issue definition doc produced by /defining-issues (referenced by AI Skills memo)
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(4,'markdownshowcs1',1,replace('## 📄 Issue Definition: Add Full-Text Search to Memos #ai #programming\n\n*Generated with `/defining-issues` from [boojack/skills](https://github.com/boojack/skills)*\n\n---\n\n### Background\n\nUsers rely on tag filtering and manual scrolling to find memos. As the memo count grows, discoverability becomes a pain point with no way to search by keyword.\n\n### Issue Statement\n\nThere is no full-text search capability. Users cannot search memo content by keyword, making it hard to resurface older notes or find related ideas.\n\n### Current State\n\n- Tag-based filtering works via `#hashtag` syntax\n- No search index exists in the database\n- The API has no search endpoint\n- Browsing is limited to chronological scroll or tag drill-down\n\n### Proposed Scope\n\n- Add a search input to the main UI\n- Implement SQLite FTS5 full-text indexing on `memo.content`\n- Return ranked results via `GET /api/memos?search=<query>`\n- Highlight matched terms in search results\n\n### Non-Goals\n\n- Semantic / vector search\n- Search across attachments or comments\n- Cross-user search for admins\n\n### Open Questions\n\n1. Should search respect memo visibility (`PUBLIC` / `PRIVATE`)?\n2. Do we index archived memos?\n3. Real-time results as-you-type, or on submit?\n4. Should tags be weighted higher than body text in ranking?','\n',char(10)),'PUBLIC','{"tags":["ai","programming"],"property":{"hasLink":true,"hasCode":true}}');

-- 5. Travel Bucket List (has location: Paris)
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(5,'travelbucket01',1,replace('## 🌍 My Travel Bucket List #travel #bucketlist\n\n### Places I''ve Been\n- [x] Paris, France — Amazing food and art!\n- [x] Shanghai, China — Modern skyline meets ancient temples\n- [x] Grand Canyon, USA — Breathtaking views\n- [x] Barcelona, Spain — Gaudí''s architecture is incredible\n\n### Dream Destinations\n- [ ] Northern Lights in Iceland\n- [ ] Safari in Tanzania\n- [ ] Great Barrier Reef, Australia\n- [ ] Machu Picchu, Peru\n- [ ] Santorini, Greece\n- [ ] New Zealand road trip\n\n### 2025 Plans\n- [ ] Book tickets to Iceland for winter\n- [ ] Research best time to visit Patagonia\n- [ ] Save up for Australia trip','\n',char(10)),'PUBLIC','{"tags":["travel","bucketlist"],"property":{"hasTaskList":true,"hasIncompleteTasks":true},"location":{"placeholder":"Paris, Île-de-France, France","latitude":48.8566,"longitude":2.3522}}');

-- 6. Movie Watchlist — posted by Alice
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(6,'moviewatch00001',2,replace('## 🎬 February Movie Marathon #movies #watchlist\n\nCatching up on films I''ve been meaning to watch!\n\n### This Month''s Queue\n\n| Movie | Genre | Status | Rating |\n|-------|-------|--------|--------|\n| The Grand Budapest Hotel | Comedy/Drama | ✅ Watched | ⭐⭐⭐⭐⭐ |\n| Inception | Sci-Fi | ✅ Watched | ⭐⭐⭐⭐⭐ |\n| Spirited Away | Animation | ✅ Watched | ⭐⭐⭐⭐⭐ |\n| Dune: Part Two | Sci-Fi | 📅 This weekend | — |\n| Oppenheimer | Biography | 📋 Queued | — |\n\n### Notes\n- Grand Budapest Hotel: Wes Anderson''s visual style is *chef''s kiss* ✨\n- Inception: Need to watch again to catch all the details\n- Spirited Away: Studio Ghibli never disappoints!\n\n---\n\n**Next month**: Planning a full Miyazaki marathon 🎨','\n',char(10)),'PUBLIC','{"tags":["movies","watchlist"],"property":{"hasLink":false}}');

-- 7. Comment on Welcome (by Alice)
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(7,'welcomecmt00001',2,'Just set up my own instance — this is exactly the note-taking app I''ve been looking for! The interface is so clean 🙌','PUBLIC','{"property":{"hasLink":false}}');

-- 8. Comment on AI Skills (by Alice)
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(8,'aiskillscmt0001',2,'Just tried `/defining-issues` on a backlog item that''s been vague for weeks — the output `definition.md` was clearer than anything I''d written by hand. The "no solution language" constraint really forces you to think. 🤯','PUBLIC','{"property":{"hasLink":false}}');

-- 9. Reply on AI Skills (by Demo)
INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES(9,'aiskillscmt0002',1,'Exactly — and once you have a solid `definition.md`, `/writing-designs` is scary good. It actually cites real engineering references instead of just making things up 🚀','PUBLIC','{"property":{"hasLink":false}}');

-- Memo Relations
INSERT INTO memo_relation VALUES(3,4,'REFERENCE');   -- AI Skills references the example issue definition doc
INSERT INTO memo_relation VALUES(7,1,'COMMENT');     -- Alice comments on Welcome
INSERT INTO memo_relation VALUES(8,3,'COMMENT');     -- Alice comments on AI Skills
INSERT INTO memo_relation VALUES(9,3,'COMMENT');     -- Demo replies on AI Skills

-- Reactions
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(1,1,'memos/welcome2memos001','🎉');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(2,2,'memos/welcome2memos001','👍');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(3,1,'memos/welcome2memos001','👏');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(4,2,'memos/aiskillsrepo001','🔥');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(5,1,'memos/aiskillsrepo001','💡');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(6,2,'memos/aiskillsrepo001','👍');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(7,1,'memos/sponsor0000001','🚀');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(8,2,'memos/sponsor0000001','👍');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(9,2,'memos/markdownshowcs1','💡');
INSERT INTO reaction (id,creator_id,content_id,reaction_type) VALUES(10,2,'memos/travelbucket01','👀');

-- System Settings
INSERT INTO system_setting VALUES ('MEMO_RELATED', '{"contentLengthLimit":8192,"enableAutoCompact":true,"enableComment":true,"enableLocation":true,"defaultVisibility":"PUBLIC","reactions":["👍","💛","🔥","👏","😂","👌","🚀","👀","🤔","🤡","❓","+1","🎉","💡","✅"]}', '');
