import { Logger } from '@nestjs/common';
import { escapeHtml, renderMessage, renderTemplate } from './template-renderer';

describe('renderTemplate — substitution', () => {
  it('substitutes every occurrence, with or without inner spaces', () => {
    const { text } = renderTemplate('{{a}} then {{ a }} and {{b}}', { a: 'X', b: 'Y' });
    expect(text).toBe('X then X and Y');
  });

  it('accepts numbers and renders them as text, including zero', () => {
    expect(renderTemplate('in {{days}} days', { days: 3 }).text).toBe('in 3 days');
    expect(renderTemplate('{{n}} left', { n: 0 }).text).toBe('0 left');
  });
});

describe('renderTemplate — missing variables', () => {
  it('leaves the placeholder intact and NEVER writes "undefined"', () => {
    const { text, missing } = renderTemplate('Hello {{name}}, you owe {{amount}}', {
      name: 'Asha',
    });
    expect(text).toBe('Hello Asha, you owe {{amount}}');
    expect(text).not.toContain('undefined');
    expect(missing).toEqual(['amount']);
  });

  it('treats null and empty string as missing too', () => {
    const { text, missing } = renderTemplate('{{a}}|{{b}}', { a: null, b: '' });
    expect(text).toBe('{{a}}|{{b}}');
    expect(missing).toEqual(['a', 'b']);
  });

  it('reports each missing name once, however often it appears', () => {
    expect(renderTemplate('{{x}} {{x}} {{x}}', {}).missing).toEqual(['x']);
  });

  it('logs a warning naming the unresolved placeholders', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    renderMessage('payment.success', 'EMAIL', { subject: 'Hi', body: '{{amount}}' }, {});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('amount');
    warn.mockRestore();
  });

  it('logs nothing when every placeholder resolves', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    renderMessage('payment.success', 'EMAIL', { subject: 'Hi', body: '{{amount}}' }, { amount: 1 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('escapeHtml', () => {
  it('neutralises a script tag rather than passing it through', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes the ampersand first, so entities are not double-decoded', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('renderMessage — escaping is per channel', () => {
  const template = { subject: 'Hello {{name}}', body: 'Welcome {{name}}' };

  it('escapes an injected value in an EMAIL body', () => {
    const out = renderMessage('x', 'EMAIL', template, { name: '<img onerror=1>' });
    expect(out.body).toBe('Welcome &lt;img onerror=1&gt;');
  });

  it('leaves SMS and IN_APP bodies as plain text — no entity noise', () => {
    for (const channel of ['SMS', 'IN_APP']) {
      const out = renderMessage('x', channel, template, { name: 'Ben & Co' });
      expect(out.body).toBe('Welcome Ben & Co');
    }
  });

  it('never escapes the subject, which is not markup in any client', () => {
    const out = renderMessage('x', 'EMAIL', template, { name: 'Ben & Co' });
    expect(out.subject).toBe('Hello Ben & Co');
  });

  it('returns no subject when the template has none (an SMS row)', () => {
    const out = renderMessage('x', 'SMS', { subject: null, body: 'hi' }, {});
    expect(out.subject).toBeUndefined();
  });
});
