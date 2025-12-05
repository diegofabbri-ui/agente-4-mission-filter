# SEARCH OPERATORS CONFIGURATION (Technical SEO)

**Context:** Technical reference for constructing advanced search queries using Boolean logic and search operators.
**Objective:** Maximize relevance of search results for remote work opportunities and minimize unrelated content (SEO spam, blogs).

---

## 1. EXCLUSION PARAMETERS (Noise Reduction)
Use these operators in every query to filter out non-job content:

* `-inurl:blog` : Excludes blog posts discussing work instead of offering it.
* `-intitle:review` : Excludes platform reviews.
* `-intitle:"top 10"` : Excludes listicles and clickbait articles.
* `-site:pinterest.*` : Excludes image-based results.
* `-site:quora.com` : Excludes general questions (unless searching for specific recent threads).

**Example Syntax:**
`"remote data entry" -inurl:blog -intitle:review`

---

## 2. DIRECT ATS INDEXING (Source Targeting)
Target specific Applicant Tracking Systems (ATS) used by tech companies and startups to find unadvertised contract roles.

* `site:greenhouse.io ("contract" OR "freelance")` : Searches public listings on Greenhouse.
* `site:lever.co ("remote" AND "Europe")` : Searches public listings on Lever.
* `site:breezy.hr "part-time"` : Searches Breezy HR.
* `site:workable.com "contractor"` : Searches Workable.

---

## 3. RECENCY OPERATORS (Time Constraints)
To ensure opportunities are actionable ("Alpha"), time parameters are mandatory.

* `after:YYYY-MM-DD` : Returns documents indexed after a specific date.
    * *Instruction:* Always calculate yesterday's date and insert it dynamically.
* `"posted * hours ago"` : Wildcard match for recent postings.

---

## 4. COMMUNITY & SOCIAL SOURCING
Locate immediate needs posted on social platforms before they reach major job boards.

* **Reddit:**
    `site:reddit.com/r/forhire OR site:reddit.com/r/beermoney "hiring" "task" -intitle:"hiring graphic designer"`
* **LinkedIn / X:**
    `site:linkedin.com/feed "looking for a freelancer" AND "DM me"`
    `site:twitter.com "hiring" "contract" "remote"`

---

## 5. DOCUMENT SEARCH (RFPs & Tenders)
Locate official documents, Request for Proposals (RFPs), or academic grants.

* `filetype:pdf "request for proposal" AND "remote"`
* `filetype:pdf "call for applications" AND "contract"`
* `filetype:doc OR filetype:docx "project scope" "budget" "external consultant"`

---

## 6. BOOLEAN LOGIC
Use these operators to construct complex queries:

* **OR (|):** Broadens search to synonyms.
    * *Example:* `"user testing" OR "usability study"`
* **AND (+):** Narrows search (implied in most engines, but explicit use helps clarity).
    * *Example:* `"python" AND "remote" AND "urgent"`
* **Wildcard (*):** Placeholder for unknown terms.
    * *Example:* `"looking for a * developer"`
* **AROUND(X):** Proximity search (finds words near each other).
    * *Example:* `"pay" AROUND(3) "hour"`

---

## 7. QUERY COMPOSITION LOGIC (Examples)

**Scenario A: High-Ticket Data Tasks**
`"data entry" OR "data annotation" site:greenhouse.io OR site:lever.co "remote" -intitle:blog after:2024-XX-XX`

**Scenario B: B2B User Research**
`"seeking participants" "study" "software" (reward OR compensation) -site:facebook.com after:2024-XX-XX`

**Scenario C: Entry-Level Bug Bounty**
`"vulnerability disclosure program" ("reward" OR "bounty") -site:hackerone.com`

---

**SYSTEM INSTRUCTION:**
When constructing queries for Perplexity, translate the user's intent using these operators. Do not use natural language questions like "Find me jobs". Use the operator syntax above.