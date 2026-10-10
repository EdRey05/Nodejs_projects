from .ligation import parse as parse_ligation
from .colony_pcr import parse as parse_colony_pcr
from .dna_extraction import parse as parse_dna_extraction
from .dna_quantification import parse as parse_dna_quantification
from .nanodrop import parse as parse_nanodrop

PARSERS = {
    'ligation': parse_ligation,
    'colony_pcr': parse_colony_pcr,
    'dna_extraction': parse_dna_extraction,
    'dna_quantification': parse_dna_quantification,
    'nanodrop': parse_nanodrop,
}
