import { ICON_SHAPES } from './goalCharacteristics';

function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs((2 * l) - 1)) * s;
    const segment = hue / 60;
    const second = chroma * (1 - Math.abs((segment % 2) - 1));
    const [red, green, blue] = segment < 1 ? [chroma, second, 0]
        : segment < 2 ? [second, chroma, 0]
            : segment < 3 ? [0, chroma, second]
                : segment < 4 ? [0, second, chroma]
                    : segment < 5 ? [second, 0, chroma] : [chroma, 0, second];
    const match = l - (chroma / 2);
    return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function createRandomLevelColors(levels) {
    const startingHue = Math.floor(Math.random() * 360);
    return Object.fromEntries(levels.map((option, index) => {
        const hue = (startingHue + (index * 83)) % 360;
        const saturation = 62 + ((index % 2) * 8);
        const lightness = 42 + ((index % 3) * 5);
        return [option.type, {
            color: hslToHex(hue, saturation, lightness),
            secondary_color: hslToHex((hue + 180) % 360, Math.min(saturation + 8, 90), lightness >= 47 ? 26 : 80),
        }];
    }));
}

export function createRandomLevelIcons(levels) {
    const icons = ICON_SHAPES.map((shape) => shape.value);
    for (let index = icons.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [icons[index], icons[swapIndex]] = [icons[swapIndex], icons[index]];
    }
    return Object.fromEntries(levels.map((option, index) => [option.type, icons[index]]));
}
