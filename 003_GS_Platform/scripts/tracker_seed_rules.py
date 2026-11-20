"""Reusable, deterministic synthetic display-data rules. No sequences are generated."""
import json
from datetime import date, timedelta
import re
from pathlib import Path

HERE = Path(__file__).parent
NO_VECTOR = 'DNA Fragment - No Vector'
QUANTITIES = {
    'F': ['200-400 ng', '400 ng', '1 ug', '2 ug', '4 ug'],
    'P': ['2-4 ug', '4 ug', '10 ug', '50 ug', '100 ug', '200 ug', '500 ug'],
}


def pool(name):
    return json.loads((HERE / name).read_text(encoding='utf-8-sig'))


def deliverable(vector):
    if vector == NO_VECTOR:
        return 'F'
    return 'P' if vector in ('pUC57-Amp', 'pUC57-Kan') else 'V'


def quantity_code(quantity, kind):
    """Compare numeric endpoints in ng; exact endpoint labels are standard too."""
    match = re.fullmatch(r'(\d+)(?:-(\d+))? (ng|ug)', quantity)
    if not match:
        raise ValueError(f'Invalid quantity label: {quantity}')
    low, high, unit = match.groups()
    factor = 1000 if unit == 'ug' else 1
    low, high = int(low) * factor, int(high or low) * factor
    standard_low, standard_high = (200, 400) if kind == 'F' else (2000, 4000)
    return '1' if standard_low <= low <= high <= standard_high else '2'


def work_number(vector, quantity, order_date, counter, delivery_format):
    if not 1 <= counter <= 9999:
        raise ValueError('Work Number counter must be between 1 and 9999')
    kind = deliverable(vector)
    # Initial synthetic projects are standard X/Z projects; no revision suffixes.
    project = 'Z' if ' + Gel' in delivery_format else 'X'
    month = '123456789ABC'[order_date.month - 1]
    return f'{project}{kind}{quantity_code(quantity, kind)}{order_date.year % 10}{month}{counter:04d}'


def row_values(rng, delivery_rng, order_date, counter, references):
    vector = rng.choice(list(references))
    kind = deliverable(vector)
    options = QUANTITIES['F' if kind == 'F' else 'P']
    quantity = rng.choices(options, weights=[2] + [1] * (len(options) - 1), k=1)[0]
    base = delivery_rng.choices(['Lyophilized', 'In solution'], weights=[5, 1], k=1)[0]
    delivery = base + delivery_rng.choice(['', ' + Gel', ' + Gly', ' + Gel + Gly'])
    low, high = rng.choices([(20, 10000), (10001, 20000)], weights=[2, 1], k=1)[0]
    return dict(vector=vector, cloning_site=rng.choice(pool('cloning_site_seed_pool.json')),
                resistance=references[vector], length=rng.randint(low, high), quantity=quantity,
                delivery_format=delivery,
                work_number=work_number(vector, quantity, order_date, counter, delivery))


def january_order_dates(orders, rng):
    """One date per order in counter order, starting Jan 3 and staying in January."""
    current = date(2026, 1, 3)
    result = {}
    for key in orders:
        if key in result:
            continue
        if result:
            current += timedelta(days=rng.randint(0, min(3, 31 - current.day)))
        result[key] = current
    return result
