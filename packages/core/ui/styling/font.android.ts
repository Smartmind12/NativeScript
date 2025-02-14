import { Font as FontBase, parseFontFamily, genericFontFamilies, FontWeight, FontVariationSettings } from './font-common';
import { FontStyleType, FontWeightType, FontVariationSettingsType } from './font-interfaces';
import { Trace } from '../../trace';
import { SDK_VERSION } from '../../utils/constants';
import * as fs from '../../file-system';
import { ad } from '../../utils';

export * from './font-common';

const FONTS_BASE_PATH = '/fonts/';
const typefaceCache = new Map<string, android.graphics.Typeface>();
let appAssets: android.content.res.AssetManager;

export class Font extends FontBase {
	static default = new Font(undefined, undefined);

	private _typeface: android.graphics.Typeface;

	constructor(family: string, size: number, style?: FontStyleType, weight?: FontWeightType, fontVariationSettings?: Array<FontVariationSettingsType>) {
		super(family, size, style, weight, 1, fontVariationSettings);
	}

	public withFontFamily(family: string): Font {
		return new Font(family, this.fontSize, this.fontStyle, this.fontWeight, this.fontVariationSettings);
	}

	public withFontStyle(style: FontStyleType): Font {
		return new Font(this.fontFamily, this.fontSize, style, this.fontWeight, this.fontVariationSettings);
	}

	public withFontWeight(weight: FontWeightType): Font {
		return new Font(this.fontFamily, this.fontSize, this.fontStyle, weight, this.fontVariationSettings);
	}

	public withFontSize(size: number): Font {
		return new Font(this.fontFamily, size, this.fontStyle, this.fontWeight, this.fontVariationSettings);
	}

	public withFontScale(scale: number): Font {
		return new Font(this.fontFamily, this.fontSize, this.fontStyle, this.fontWeight, this.fontVariationSettings);
	}

	public withFontVariationSettings(variationSettings: Array<FontVariationSettingsType> | null): Font {
		return new Font(this.fontFamily, this.fontSize, this.fontStyle, this.fontWeight, variationSettings);
	}

	getAndroidTypeface(): android.graphics.Typeface {
		if (!this._typeface) {
			this._typeface = createTypeface(this);
		}

		return this._typeface;
	}

	getUIFont(defaultFont: UIFont): UIFont {
		return undefined;
	}
}

function computeFontCacheKey(fontFamily: string, font: Font) {
	const sep = ':';
	return [fontFamily, String(FontVariationSettings.toString(font.fontVariationSettings)).replace(/'/g, '').replace(/[\s,]/g, '_')].join(sep);
}

function loadFontFromFile(fontFamily: string, font: Font): android.graphics.Typeface {
	const apiLevel = android.os.Build.VERSION.SDK_INT;
	const cacheKey = apiLevel >= 26 ? computeFontCacheKey(fontFamily, font) : fontFamily;

	appAssets = appAssets || (ad.getApplicationContext() as android.content.Context).getAssets();
	if (!appAssets) {
		return null;
	}

	let result = typefaceCache.get(cacheKey);
	// Check for undefined explicitly as null mean we tried to load the font, but failed.
	if (result === undefined) {
		result = null;

		let fontAssetPath: string;
		const basePath = fs.path.join(fs.knownFolders.currentApp().path, 'fonts', fontFamily);
		if (fs.File.exists(basePath + '.ttf')) {
			fontAssetPath = FONTS_BASE_PATH + fontFamily + '.ttf';
		} else if (fs.File.exists(basePath + '.otf')) {
			fontAssetPath = FONTS_BASE_PATH + fontFamily + '.otf';
		} else if (Trace.isEnabled()) {
			Trace.write('Could not find font file for ' + fontFamily, Trace.categories.Error, Trace.messageType.error);
		}

		if (fontAssetPath) {
			try {
				fontAssetPath = fs.path.join(fs.knownFolders.currentApp().path, fontAssetPath);
				if (apiLevel >= 26) {
					const builder = new android.graphics.Typeface.Builder(fontAssetPath);
					if (builder) {
						if (font.fontVariationSettings !== undefined) {
							builder.setFontVariationSettings(font.fontVariationSettings?.length ? FontVariationSettings.toString(font.fontVariationSettings) : '');
						}
						result = builder.build();
					} else {
						result = android.graphics.Typeface.createFromFile(fontAssetPath);
						if (Trace.isEnabled()) {
							Trace.write('Could not create builder for ' + fontFamily, Trace.categories.Error, Trace.messageType.error);
						}
					}
				} else {
					result = android.graphics.Typeface.createFromFile(fontAssetPath);
				}
			} catch (e) {
				if (Trace.isEnabled()) {
					Trace.write('Error loading font asset: ' + fontAssetPath, Trace.categories.Error, Trace.messageType.error);
				}
			}
		}
		typefaceCache.set(cacheKey, result);
	}

	return result;
}

function createTypeface(font: Font): android.graphics.Typeface {
	let fontStyle = 0;
	if (font.isBold) {
		fontStyle |= android.graphics.Typeface.BOLD;
	}
	if (font.isItalic) {
		fontStyle |= android.graphics.Typeface.ITALIC;
	}

	//http://stackoverflow.com/questions/19691530/valid-values-for-androidfontfamily-and-what-they-map-to
	const fontFamilies = parseFontFamily(font.fontFamily);
	let result: android.graphics.Typeface = null;
	for (const fontFamily of fontFamilies) {
		switch (fontFamily.toLowerCase()) {
			case genericFontFamilies.serif:
				result = android.graphics.Typeface.create('serif' + getFontWeightSuffix(font.fontWeight), fontStyle);
				break;

			case genericFontFamilies.sansSerif:
			case genericFontFamilies.system:
				result = android.graphics.Typeface.create('sans-serif' + getFontWeightSuffix(font.fontWeight), fontStyle);
				break;

			case genericFontFamilies.monospace:
				result = android.graphics.Typeface.create('monospace' + getFontWeightSuffix(font.fontWeight), fontStyle);
				break;

			default: {
				result = loadFontFromFile(fontFamily, font);
				if (result && fontStyle) {
					result = android.graphics.Typeface.create(result, fontStyle);
				}
				break;
			}
		}

		if (result) {
			// Found the font!
			break;
		}
	}

	if (!result) {
		result = android.graphics.Typeface.create('sans-serif' + getFontWeightSuffix(font.fontWeight), fontStyle);
	}

	return result;
}

function getFontWeightSuffix(fontWeight: FontWeightType): string {
	if (typeof fontWeight === 'number') {
		fontWeight = (fontWeight + '') as any;
	}
	switch (fontWeight) {
		case FontWeight.THIN:
			return SDK_VERSION >= 16 ? '-thin' : '';
		case FontWeight.EXTRA_LIGHT:
		case FontWeight.LIGHT:
			return SDK_VERSION >= 16 ? '-light' : '';
		case FontWeight.NORMAL:
		case '400':
		case undefined:
		case null:
			return '';
		case FontWeight.MEDIUM:
		case FontWeight.SEMI_BOLD:
			return SDK_VERSION >= 21 ? '-medium' : '';
		case FontWeight.BOLD:
		case '700':
		case FontWeight.EXTRA_BOLD:
			return '';
		case FontWeight.BLACK:
			return SDK_VERSION >= 21 ? '-black' : '';
		default:
			throw new Error(`Invalid font weight: "${fontWeight}"`);
	}
}
