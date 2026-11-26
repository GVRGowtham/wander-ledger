import {
  CATEGORY_META,
  COLORS,
  DARK_CATEGORY_META,
  DARK_COLORS,
  DARK_SHADOWS,
  DARK_TRANSPORT_MODE_META,
  getCategoryMeta,
  getTransportModeMeta,
  LIGHT_COLORS,
  LIGHT_SHADOWS,
  resolveThemeMode,
  SHADOWS,
  TRANSPORT_MODE_META,
} from '../theme/tokens';

describe('theme mode resolution', () => {
  it('honors explicit light preference regardless of OS scheme', () => {
    expect(resolveThemeMode('light', 'light')).toBe('light');
    expect(resolveThemeMode('light', 'dark')).toBe('light');
    expect(resolveThemeMode('light', null)).toBe('light');
    expect(resolveThemeMode('light', undefined)).toBe('light');
  });

  it('honors explicit dark preference regardless of OS scheme', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
    expect(resolveThemeMode('dark', 'dark')).toBe('dark');
    expect(resolveThemeMode('dark', null)).toBe('dark');
    expect(resolveThemeMode('dark', undefined)).toBe('dark');
  });

  it('follows OS scheme when preference is system and defaults to light when unavailable', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
    expect(resolveThemeMode('system', null)).toBe('light');
    expect(resolveThemeMode('system', undefined)).toBe('light');
  });
});

describe('theme token parity & dark mode palette integrity', () => {
  it('keeps LIGHT_COLORS and DARK_COLORS key-for-key identical', () => {
    expect(Object.keys(DARK_COLORS).sort()).toEqual(Object.keys(LIGHT_COLORS).sort());
    expect(COLORS).toBe(LIGHT_COLORS);
  });

  it('keeps LIGHT_SHADOWS and DARK_SHADOWS key-for-key identical', () => {
    expect(Object.keys(DARK_SHADOWS).sort()).toEqual(Object.keys(LIGHT_SHADOWS).sort());
    expect(SHADOWS).toBe(LIGHT_SHADOWS);
  });

  it('uses genuinely dark Midnight Passport surfaces and bright ink in DARK_COLORS', () => {
    expect(DARK_COLORS.canvas).toBe('#0E111B');
    expect(DARK_COLORS.card).toBe('#171C2C');
    expect(DARK_COLORS.ink).toBe('#F5F2EB');
    expect(DARK_COLORS.canvas).not.toBe(LIGHT_COLORS.canvas);
    expect(DARK_COLORS.card).not.toBe(LIGHT_COLORS.card);
    expect(DARK_COLORS.ink).not.toBe(LIGHT_COLORS.ink);
    expect(DARK_COLORS.navyText).not.toBe(LIGHT_COLORS.navyText);
  });

  it('provides full category metadata parity between light and dark palettes', () => {
    const light = getCategoryMeta(false);
    const dark = getCategoryMeta(true);

    expect(light).toBe(CATEGORY_META);
    expect(dark).toBe(DARK_CATEGORY_META);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());

    for (const key of Object.keys(light) as Array<keyof typeof light>) {
      expect(dark[key].label).toBe(light[key].label);
      expect(dark[key].emoji).toBe(light[key].emoji);
      expect(dark[key].bg).not.toBe(light[key].bg);
      expect(dark[key].color).not.toBe(light[key].color);
    }
  });

  it('provides full transport mode metadata parity between light and dark palettes', () => {
    const light = getTransportModeMeta(false);
    const dark = getTransportModeMeta(true);

    expect(light).toBe(TRANSPORT_MODE_META);
    expect(dark).toBe(DARK_TRANSPORT_MODE_META);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());

    for (const key of Object.keys(light) as Array<keyof typeof light>) {
      expect(dark[key].label).toBe(light[key].label);
      expect(dark[key].emoji).toBe(light[key].emoji);
      expect(dark[key].bg).not.toBe(light[key].bg);
      expect(dark[key].color).not.toBe(light[key].color);
    }
  });
});
