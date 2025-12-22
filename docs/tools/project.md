# Project Tools

Project information tools

## Tools

- [get_project_info](#get_project_info)
- [list_project_files](#list_project_files)
- [search_files](#search_files)
- [get_project_settings](#get_project_settings)

---

## get_project_info

Get information about the current Godot project

### Parameters

*No parameters required.*

---

## list_project_files

List files in the project by type

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_type` | enum (6 values) | Yes | Type of files to list |
| `directory` | string | No | Optional directory to search in (defaults to "res://") |
| `recursive` | boolean | No | Whether to search recursively (defaults to true) |

---

## search_files

Search for files by name pattern

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | Search pattern (supports * wildcard) |
| `directory` | string | No | Optional directory to search in |

---

## get_project_settings

Get project settings

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Settings category to filter by (use "input" for input action mappings) |
| `include_builtin` | boolean | No | When category is "input", include built-in ui_* actions (default: false) |

---

