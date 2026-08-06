import zhCN from './zh-CN';

type LocaleTable = typeof zhCN;

const locales: Record<string, LocaleTable> = {
  'zh-CN': zhCN,
};

const activeLocale = 'zh-CN';

export function t(key: string): string {
  const segments = key.split('.');
  let node: unknown = locales[activeLocale];

  for (const segment of segments) {
    if (typeof node !== 'object' || node === null) {
      return key;
    }
    node = (node as Record<string, unknown>)[segment];
  }

  return typeof node === 'string' ? node : key;
}
