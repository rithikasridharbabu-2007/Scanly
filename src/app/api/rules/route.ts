import { NextResponse } from 'next/server';
import axe from 'axe-core';

export async function GET(request: Request) {
  const ruleId = new URL(request.url).searchParams.get('ruleId');
  const rules = axe.getRules(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

  if (ruleId) {
    const rule = rules.find(item => item.ruleId === ruleId);

    if (!rule) {
      return NextResponse.json(
        {
          status: 'failed',
          error: {
            code: 'RULE_NOT_FOUND',
            message: `No WCAG rule found for "${ruleId}"`,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  }

  return NextResponse.json({ rules });
}
