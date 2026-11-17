"""The goal level icons the client offers must be exactly the ones the API accepts."""

import re
from pathlib import Path

from validators.goals import GOAL_LEVEL_ICONS

CLIENT = Path(__file__).resolve().parents[2] / 'client' / 'src'


def _values(path, list_name):
    source = path.read_text(encoding='utf8')
    body = re.search(rf'export const {list_name} = \[(.*?)\];', source, re.S).group(1)
    return set(re.findall(r"value: '([^']+)'", body))


def test_client_icon_shapes_match_the_api_icon_set():
    client_icons = (
        _values(CLIENT / 'utils' / 'goalCharacteristics.js', 'ICON_SHAPES')
        | _values(CLIENT / 'components' / 'atoms' / 'goalIcons' / 'illusionShapes.js', 'ILLUSION_SHAPE_OPTIONS')
    )
    assert client_icons == set(GOAL_LEVEL_ICONS)
