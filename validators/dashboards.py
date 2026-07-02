"""Analytics dashboard and page-surface validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, Any, Dict
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from .core import MAX_NAME_LENGTH, sanitize_string

def validate_dashboard_layout(value: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError('layout must be an object')

    if value.get('type') == 'analytics_view':
        required_view_keys = {'type', 'version', 'profile'}
        missing_view = sorted(required_view_keys - set(value.keys()))
        if missing_view:
            raise ValueError(f"analytics view layout is missing required keys: {', '.join(missing_view)}")
        if not isinstance(value.get('version'), int):
            raise ValueError('layout.version must be an integer')
        if not isinstance(value.get('profile'), dict):
            raise ValueError('layout.profile must be an object')
        return value

    required_keys = {'layout', 'window_states', 'selected_window_id', 'version'}
    missing = sorted(required_keys - set(value.keys()))
    if missing:
        raise ValueError(f"layout is missing required keys: {', '.join(missing)}")

    if not isinstance(value.get('layout'), dict):
        raise ValueError('layout.layout must be an object')
    if not isinstance(value.get('window_states'), dict):
        raise ValueError('layout.window_states must be an object')
    if not isinstance(value.get('selected_window_id'), str) or not value['selected_window_id'].strip():
        raise ValueError('layout.selected_window_id must be a non-empty string')
    if not isinstance(value.get('version'), int):
        raise ValueError('layout.version must be an integer')

    return value


PAGE_SURFACE_PAGES = {'goals'}
PAGE_SURFACE_PANEL_KINDS = {'tree', 'widget'}
PAGE_SURFACE_WIDGET_TYPES = {'analytics', 'calendar', 'lastSession', 'metricCard'}


def _validate_surface_grid_layout(layout: Any) -> set:
    """Validate the grid sub-object and return the set of panel ids."""
    if not isinstance(layout, dict):
        raise ValueError('config.layout must be an object')
    if layout.get('type') != 'grid':
        raise ValueError("config.layout.type must be 'grid'")
    panels = layout.get('panels')
    if not isinstance(panels, list):
        raise ValueError('config.layout.panels must be an array')

    panel_ids = set()
    for panel in panels:
        if not isinstance(panel, dict):
            raise ValueError('config.layout.panels entries must be objects')
        pid = panel.get('id')
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError('each panel must have a non-empty string id')
        for axis in ('x', 'y', 'w', 'h'):
            if not isinstance(panel.get(axis), int):
                raise ValueError(f'panel {pid} field {axis} must be an integer')
        if pid in panel_ids:
            raise ValueError(f'duplicate panel id: {pid}')
        panel_ids.add(pid)
    return panel_ids


def _validate_detail_panel_hint(value: Any) -> None:
    if value in ('auto', 'fullscreen'):
        return
    if isinstance(value, dict):
        for axis in ('x', 'y', 'w', 'h'):
            if not isinstance(value.get(axis), int):
                raise ValueError("config.detail_panel object requires integer x/y/w/h")
        return
    raise ValueError("config.detail_panel must be 'auto', 'fullscreen', or an {x,y,w,h} object")


def validate_surface_config(value: Dict[str, Any], *, label: str = 'config') -> Dict[str, Any]:
    """Validate one page-surface config payload (desktop or mobile)."""
    if not isinstance(value, dict):
        raise ValueError(f'{label} must be an object')

    if not isinstance(value.get('version'), int):
        raise ValueError(f'{label}.version must be an integer')

    panel_ids = _validate_surface_grid_layout(value.get('layout'))

    panel_contents = value.get('panel_contents')
    if not isinstance(panel_contents, dict):
        raise ValueError(f'{label}.panel_contents must be an object')

    # Every panel must have content; every content entry must map to a panel.
    missing_content = panel_ids - set(panel_contents.keys())
    if missing_content:
        raise ValueError(f'{label}: panels without content: {", ".join(sorted(missing_content))}')
    orphan_content = set(panel_contents.keys()) - panel_ids
    if orphan_content:
        raise ValueError(f'{label}: content without panels: {", ".join(sorted(orphan_content))}')

    tree_count = 0
    for pid, content in panel_contents.items():
        if not isinstance(content, dict):
            raise ValueError(f'{label}: panel {pid} content must be an object')
        kind = content.get('kind')
        if kind not in PAGE_SURFACE_PANEL_KINDS:
            raise ValueError(f'{label}: panel {pid} has unknown kind: {kind}')
        if kind == 'tree':
            tree_count += 1
        elif kind == 'widget':
            if content.get('widgetType') not in PAGE_SURFACE_WIDGET_TYPES:
                raise ValueError(f'{label}: panel {pid} has unknown widgetType: {content.get("widgetType")}')

    if tree_count != 1:
        raise ValueError(f'{label} must contain exactly one tree panel (found {tree_count})')

    if 'detail_panel' in value:
        _validate_detail_panel_hint(value.get('detail_panel'))

    view_configs = value.get('view_configs')
    if view_configs is not None:
        if not isinstance(view_configs, dict):
            raise ValueError(f'{label}.view_configs must be an object')
        missing_modes = {'overview', 'scoped'} - set(view_configs.keys())
        if missing_modes:
            raise ValueError(f'{label}.view_configs missing modes: {", ".join(sorted(missing_modes))}')
        for mode in ('overview', 'scoped'):
            view_config = view_configs.get(mode)
            if not isinstance(view_config, dict):
                raise ValueError(f'{label}.view_configs.{mode} must be an object')
            validate_surface_config(
                {
                    'version': value.get('version'),
                    'layout': view_config.get('layout'),
                    'layout_bounds': view_config.get('layout_bounds'),
                    'detail_panel': value.get('detail_panel', 'auto'),
                    'panel_contents': view_config.get('panel_contents'),
                },
                label=f'{label}.view_configs.{mode}'
            )

    return value


class PageSurfaceCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    page: str = Field('goals', min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    is_default: bool = Field(default=False)
    desktop_config: Dict[str, Any] = Field(...)
    mobile_config: Dict[str, Any] = Field(...)

    @field_validator('page')
    @classmethod
    def validate_page(cls, v: str) -> str:
        if v not in PAGE_SURFACE_PAGES:
            raise ValueError(f'unsupported page: {v}')
        return v

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('desktop_config')
    @classmethod
    def validate_desktop(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return validate_surface_config(v, label='desktop_config')

    @field_validator('mobile_config')
    @classmethod
    def validate_mobile(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return validate_surface_config(v, label='mobile_config')


class PageSurfaceUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    is_default: Optional[bool] = None
    desktop_config: Optional[Dict[str, Any]] = None
    mobile_config: Optional[Dict[str, Any]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else sanitize_string(v)

    @field_validator('desktop_config')
    @classmethod
    def validate_desktop(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return None if v is None else validate_surface_config(v, label='desktop_config')

    @field_validator('mobile_config')
    @classmethod
    def validate_mobile(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return None if v is None else validate_surface_config(v, label='mobile_config')

    @model_validator(mode='after')
    def require_at_least_one_field(self):
        if (self.name is None and self.is_default is None
                and self.desktop_config is None and self.mobile_config is None):
            raise ValueError('At least one field is required')
        return self


class DashboardCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    kind: str = Field('dashboard')
    layout: Dict[str, Any] = Field(...)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('kind')
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in {'view', 'dashboard'}:
            raise ValueError("kind must be 'view' or 'dashboard'")
        return v

    @field_validator('layout')
    @classmethod
    def validate_layout(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return validate_dashboard_layout(v)


class DashboardUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    kind: Optional[str] = None
    layout: Optional[Dict[str, Any]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('kind')
    @classmethod
    def validate_kind(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in {'view', 'dashboard'}:
            raise ValueError("kind must be 'view' or 'dashboard'")
        return v

    @field_validator('layout')
    @classmethod
    def validate_layout(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return v
        return validate_dashboard_layout(v)

    @model_validator(mode='after')
    def require_at_least_one_field(self):
        if self.name is None and self.kind is None and self.layout is None:
            raise ValueError('At least one of name, kind, or layout is required')
        return self


