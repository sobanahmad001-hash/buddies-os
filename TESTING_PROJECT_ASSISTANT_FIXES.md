# Project Assistant Fixes - Testing Checklist

**Commits deployed:**
- `1ba0fb6` — Backend resilience (provider failover, session schema fallback)
- `b865ca4` — Frontend response validation (res.ok check, empty content handling)
- `351ff21` — Response extraction helper with explicit message type categorization

---

## Test Plan: 4 Critical Scenarios

### ✅ Test 1: Normal Text Response

**Scenario:** User sends a message expecting a plain text reply.

**Steps:**
1. Navigate to a project's assistant chat
2. Send: "What is the current status of this project?"
3. Wait for response

**Expected:**
- ✓ Assistant bubble appears with readable text
- ✓ No blank/empty bubble
- ✓ Text content is visible and properly formatted
- ✓ Markdown (bold, lists, code blocks) renders correctly

**What breaks if this fails:**
- Response extraction logic is not parsing `data.reply` correctly
- Message state update is not triggering re-render

---

### ✅ Test 2: Provider/Backend Failure Scenario

**Scenario:** Backend returns HTTP 500 or provider error.

**Setup (temporary):**
- (Optional) To force a failure: Set an invalid API key env var temporarily
- Or send a request with a known-bad provider configuration

**Steps:**
1. Attempt to trigger a chat message
2. Observe the response in browser Network tab
3. Check the chat display

**Expected:**
- ✓ Response shows HTTP status ≠ 200
- ✓ Chat displays a visible error message like: "⚠️ Request failed: [error description]"
- ✓ NO blank bubble
- ✓ Human can read what went wrong

**What breaks if this fails:**
- `res.ok` check failed to prevent rendering undefined reply
- Error responses not being caught before state update

---

### ✅ Test 3: Action-Only Response

**Scenario:** Backend returns a response with an action block but minimal/no plain text.

**Steps:**
1. Send a request designed to trigger an action block  
   Example: "Create a task named 'Test task'"
2. Observe assistant response

**Expected:**
- ✓ Action block (approval card) is rendered
- ✓ Text around action block is visible (if any)
- ✓ If text is empty, action block is still clear and actionable
- ✓ NOT a blank bubble with just the action in a collapsed state

**What breaks if this fails:**
- `stripAllActionBlocks("")` stripping all content and rendering an invisible spacer
- Message render layer not detecting action-only state

---

### ✅ Test 4: Session Switch + Message Landing

**Scenario:** Chat sessions are switched while messages are in flight. Verify replies land in correct thread.

**Steps:**
1. Open Project Assistant in **Session A**
2. Send a message (wait ~2 sec, don't wait for response)
3. Click another chat session tab (**Session B**)
4. Send a different message in Session B
5. Go back to **Session A**

**Expected:**
- ✓ Session A shows only its message + its reply
- ✓ Session B shows only its message + its reply  
- ✓ Replies are NOT mixed between sessions
- ✓ Each session displays in isolation

**What breaks if this fails:**
- Session state race condition causing replies to write to wrong activeSessionId
- Message state not properly keyed/filtered by session

---

## Quick Validation Checklist

Before considering this fixed, verify:

- [ ] Normal text replies render (Test 1)
- [ ] HTTP errors show visible messages instead of blank bubbles (Test 2)
- [ ] Action blocks work even with empty text (Test 3)
- [ ] Session switching doesn't cross-contaminate replies (Test 4)
- [ ] No console errors in browser DevTools
- [ ] No warnings in Network tab (successful 200 responses for normal queries)
- [ ] Markdown rendering (bold, lists, code) works in replies
- [ ] Action approval/decline buttons function

---

## Code Path Reference

### Frontend Response Flow

```
fetch('/api/projects/chat')
  ↓
parse JSON response
  ↓
extractAssistantReply(res, data)
  ├─ Check res.ok (HTTP status)
  ├─ Extract data.reply
  ├─ Check for action blocks
  ├─ Return { status, content, hasAction }
  ↓
setMessages([... { content }])
  ↓
renderMarkdown(extractActionBlock(content).cleanContent)
```

### Backend Response Guarantee

The backend now:
1. Falls back to alternate provider if primary fails
2. Falls back to legacy chat mode if session schema missing
3. Always returns non-empty `reply` or error message
4. Provides detailed error messages instead of generic "unavailable"

---

## Known Behavior After Fix

| Scenario | Frontend Shows | Status |
|----------|---|--------|
| Valid reply | Msg + text | ✓ Success |
| HTTP 500 + error | "⚠️ Request failed: {error}" | ✓ Error visible |
| Empty reply | "⚠️ Empty response from assistant" | ✓ Error visible |
| Action only | Action block ± text | ✓ Action visible |
| Network error | "❌ {error message}" | ✓ Error visible |
| Session switch | Correct session reply | ✓ Isolated |

---

## If Tests Fail

Check in this order:

1. **Blank bubble still appears?**
   - Check Network tab for HTTP status
   - If 200: verify backend is setting `reply` field  
   - If not 200: verify `res.ok` branch is executing

2. **Wrong content in bubble?**
   - Check if `stripAllActionBlocks()` is over-aggressive
   - Verify `renderMarkdown()` is not collapsing whitespace

3. **Error message shows but is hard to read?**
   - Error prefix (⚠️ or ❌) not rendering
   - Check CSS class in message bubble

4. **Sessions cross-contaminate?**
   - Verify `sessionId` is passed in fetch payload
   - Check `setMessages()` is filtering by activeSession on load

---

## Success Criteria

✅ **This fix is complete when:**
- All 4 test scenarios pass
- No blank bubbles appear anywhere
- Errors are human-readable
- Sessions stay isolated
- Action blocks render properly

