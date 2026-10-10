"""Shared utilities for Excel parsers."""

ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

def generate_plate_data(rows: int, cols: int) -> dict:
    """Generate an empty plate data structure matching the TypeScript generatePlateData."""
    data = {}
    for i in range(rows):
        row_char = chr(65 + i)
        for j in range(1, cols + 1):
            well_id = f"{row_char}{j}"
            data[well_id] = {
                "id": well_id,
                "sample": None,
                "params": {},
            }
    return data
