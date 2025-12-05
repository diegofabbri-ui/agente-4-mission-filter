# SEARCH CONFIGURATION: HIGH-VALUE OPPORTUNITIES (Daily)

**Context:** This is a configuration file for an automated professional job discovery system.
**Task:** Perform a web search to identify 5 active remote work opportunities accessible from Italy/Europe.

---

## 1. SEARCH PARAMETERS (Hard Constraints)

Apply the following filters to all search results. Do not include results that violate these rules.

### A. Time Filter (Recency)
* **Requirement:** Include only opportunities posted within the last **24 hours**.
* **Exclusion:** Exclude any post older than 48 hours to ensure availability.

### B. Economic Filter (Minimum Value)
* **Requirement:** Estimated value must be equivalent to **≥ 20€/hour**.
* **Calculation Reference:**
    * 15 min task > 5€ payout.
    * 30 min task > 10€ payout.
    * 60 min task > 20€ payout.

### C. Target Sectors (Priority List)
Focus search on these high-demand professional categories:
1.  **AI Data Quality / RLHF:** (e.g., DataAnnotation.tech, Remotasks Expert, Outlier, WeLocalize).
2.  **Professional User Research:** (e.g., UserInterviews, Respondent, B2B studies).
3.  **Market Research:** Paid professional interviews (PayPal/Bank Transfer only).
4.  **Specialized Technical Help:** Requests on LinkedIn/Reddit for immediate technical fixes (CSS, config, debugging).
5.  **Vulnerability Disclosure:** Entry-level bug bounty programs with cash rewards.

### D. Safety & Exclusion Filter
Exclude ANY result containing:
* Requests for "registration fees", "startup kits", or "deposits".
* Contact methods restricted to Telegram or WhatsApp only.
* Unrealistic claims (e.g., "Earn $500/day with no experience").
* Requests for bank details prior to a contract.
* Tasks involving package reshipping or payment processing.
* Low-paying surveys (under 5€).

---

## 2. SEARCH QUERY GUIDELINES

Use these specific search strategies and operators to find relevant results:

* **Recency:** Always use `after:YYYY-MM-DD` (insert yesterday's date).
* **Direct Listings:** `site:greenhouse.io OR site:lever.co` for direct company listings seeking "contractors" or "freelance".
* **Community:** `site:reddit.com/r/forhire` or `site:reddit.com/r/freelanceWriters` for immediate needs.
* **Keywords:** "Remote", "Contract", "Paid study", "Data annotation", "Urgent", "Italian native".

---

## 3. OUTPUT FORMAT SPECIFICATION

Return the data **strictly** as a JSON Array. Do not add introductory text, warnings, or markdown code blocks (like ```json). Just the raw array.

**JSON Structure per item:**
```json
{
  "title": "Job Title",
  "url": "Direct Application Link",
  "platform": "Source Platform Name",
  "estimated_time": "Duration (e.g. '30 min')",
  "payout": "Value (e.g. '50€')",
  "analysis": "Brief reason why this matches the high-value criteria (ROI focus)."
}