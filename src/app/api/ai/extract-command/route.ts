import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    const prompt = `Extract structured command data from this message. Return ONLY valid JSON, no other text.

Message: "${message}"

Analyze if this is a command for one of these actions:
1. Log mood/stress/sleep
2. Record a decision (GO/NO-GO/WAIT)
3. Report a blocker
4. Create a task
5. Set a rule
6. Log a project update

Return JSON in this format:
{
  "isCommand": true/false,
  "type": "mood" | "decision" | "blocker" | "task" | "rule" | "update" | null,
  "data": {
    // For mood:
    "mood": "string",
    "stress": 0-10,
    "sleep": hours,
    
    // For decision:
    "status": "GO" | "NO-GO" | "WAIT",
    "decision": "text",
    "project": "name or null",
    "confidence": 0-100 or null,
    
    // For blocker:
    "content": "text",
    "project": "name or null",
    
    // For task:
    "title": "text",
    "project": "name or null",
    
    // For rule:
    "rule": "text",
    "severity": 1-3,
    
    // For update:
    "type": "progress" | "blocker" | "insight",
    "content": "text",
    "project": "name or null"
  }
}

Examples:
"I'm exhausted, stress is 8" → {"isCommand": true, "type": "mood", "data": {"mood": "exhausted", "stress": 8}}
"decided to GO with multi-user, 80% sure" → {"isCommand": true, "type": "decision", "data": {"status": "GO", "decision": "multi-user", "confidence": 80}}
"Raahbaan blocked on legal" → {"isCommand": true, "type": "blocker", "data": {"content": "legal issue", "project": "Raahbaan"}}
"add task: integrate stripe" → {"isCommand": true, "type": "task", "data": {"title": "integrate stripe"}}

If it's NOT a command (just a question or conversation), return:
{"isCommand": false, "type": null, "data": null}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }
    } catch {
      console.error('Failed to parse Claude response:', content);
      return NextResponse.json({
        isCommand: false,
        type: null,
        data: null,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('AI command extraction error:', error);
    return NextResponse.json({
      isCommand: false,
      type: null,
      data: null,
      error: 'Failed to extract command',
    }, { status: 500 });
  }
}
