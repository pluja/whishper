from enum import Enum
from pydantic import BaseModel

class DeviceType(str, Enum):
    cpu = "cpu"
    cuda = "cuda"

class ModelSize(str, Enum):
    distil_large_v3 = "distil-large-v3"
    distil_large_v2 = "distil-large-v2"
    distil_medium = "distil-medium.en"
    turbo = "turbo"

class Languages(str, Enum):
    auto = "auto"
    ar = "ar"
    be = "be"
    bg = "bg"
    bn = "bn"
    ca = "ca"
    cs = "cs"
    cy = "cy"
    da = "da"
    de = "de"
    el = "el"
    en = "en"
    es = "es"
    fr = "fr"
    it = "it"
    ja = "ja"
    nl = "nl"
    pl = "pl"
    pt = "pt"
    ru = "ru"
    sk = "sk"
    sl = "sl"
    sv = "sv"
    tk = "tk"
    tr = "tr"
    zh = "zh"
