import { describe, it, expect } from 'vitest';
import { esc, num, safeImgSrc, safeFileHref, safeHttpUrl, clip } from '../src/lib/safe.js';

describe('esc (XSS himoyasi)', () => {
  it('maxsus belgilarni ekranlaydi', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(0)).toBe('0');
  });
  it('jsdom: ekranlangan matn DOM\'da teg yaratmaydi va atributdan chiqib keta olmaydi', () => {
    const evil = `"><img src=x onerror=alert(1)><script>alert(2)</script>`;
    const host = document.createElement('div');
    host.innerHTML = `<p title="${esc(evil)}">${esc(evil)}</p>`;
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('p').textContent).toBe(evil);
    expect(host.querySelector('p').getAttribute('title')).toBe(evil);
  });
});

describe('boshqa yordamchilar', () => {
  it('num', () => { expect(num('5')).toBe(5); expect(num('x')).toBe(0); expect(num(Infinity)).toBe(0); expect(num(null)).toBe(0); });
  it('clip', () => { expect(clip('  abcdef ', 3)).toBe('abc'); expect(clip(null, 5)).toBe(''); });
  it('safeImgSrc faqat data:image/*;base64', () => {
    expect(safeImgSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImgSrc('data:image/svg+xml;base64,AAAA')).toBe('');
    expect(safeImgSrc('javascript:alert(1)')).toBe('');
    expect(safeImgSrc('https://evil.example/x.png')).toBe('');
    expect(safeImgSrc(null)).toBe('');
  });
  it('safeFileHref faqat ruxsat etilgan hujjat turlari', () => {
    expect(safeFileHref('data:application/pdf;base64,AAAA')).toBe('data:application/pdf;base64,AAAA');
    expect(safeFileHref('data:text/html;base64,AAAA')).toBe('#');
    expect(safeFileHref('javascript:alert(1)')).toBe('#');
  });
  it('safeHttpUrl faqat http/https', () => {
    expect(safeHttpUrl('https://example.com/a?b=1', 'https://app.test')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl('javascript:alert(1)', 'https://app.test')).toBe('#');
    expect(safeHttpUrl('data:text/html,x', 'https://app.test')).toBe('#');
    expect(safeHttpUrl('/relative', 'https://app.test')).toBe('https://app.test/relative');
  });
});
