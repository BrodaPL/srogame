export const blueprintsPl = {
  buildings: {
    descriptions: {
      METAL_MINE: 'Wydobywa podstawowe zasoby metalu.',
      CRYSTAL_MINE: 'Wydobywa rzadkie zasoby krysztalu.',
      DEUTERIUM_SYNTHESIZER: 'Pozyskuje deuter.',
      SOLAR_WIND_GEOTHERMAL:
        'Wykorzystuje lokalne odnawialne zrodla energii oraz wielkoskalowe magazynowanie energii.',
      NUCLEAR_PLANT: 'Stabilna elektrownia jadrowa dla infrastruktury planety.',
      FUSION_REACTOR: 'Wytwarza energie, przetwarzajac deuter w kontrolowanych etapach fuzji.',
      METAL_STORAGE: 'Planetarny magazyn rezerw metalu.',
      CRYSTAL_STORAGE: 'Planetarny magazyn rezerw krysztalu.',
      DEUTERIUM_TANK: 'Planetarny magazyn rezerw deuteru.',
      ROBOTICS_FACTORY: 'Glowna baza przemyslowa dla budowy na planecie.',
      SHIPYARD: 'Produkuje statki i, gdy jest bezczynna, naprawia je ze zmniejszona wydajnoscia.',
      NANITE_FACTORY: 'Zwielokrotnia lokalna wydajnosc przemyslu i stoczni.',
      RESEARCH_LAB: 'Prowadzi badania nowych technologii.',
      ALLIANCE_DEPOT: 'Naprawia statki na orbicie i zaopatruje je w deuter.',
      BOMB_DEPOT: 'Przechowuje bomby planetarne do przyszlych misji bombardowania.',
      SPACEPORT: 'Zwieksza liczbe flot, ktore ta planeta moze obslugiwac.',
      TERRAFORMER: 'Tworzy nowy teren i zmniejsza negatywne kary planetarne.',
      SENSOR_PHALANX:
        'Wykrywa nadlatujace floty w normalnym zasiegu i skanuje wybrana planete w polowie zasiegu.',
      JUMP_GATE:
        'Umozliwia skoki miedzy systemami i poprawia pojemnosc Miedzygwiezdnego Portu Handlowego.',
      INTERSTELLAR_TRADE_PORT: 'Wymienia zasoby w proporcji 3:2:1 z kosztem operacyjnym.',
      BUNKER_NETWORK: 'Zmniejsza skutecznosc grabiezy wrogiego ataku dzieki lokalnej ochronie.',
    },
  },
  technologies: {
    descriptions: {
      ENERGY_TECHNOLOGY: 'Daje +2% do wytwarzania energii.',
      MATERIAL_TECHNOLOGY:
        'Zwieksza wszystkie wartosci obrony o 5% oraz skutecznosc REPAIR_EQUIPMENT o 5%.',
      HYPERSPACE_TECHNOLOGY:
        'Daje +2% zasiegu Sensor Phalanx, zwieksza pojemnosc Jump Gate i Miedzygwiezdnego Portu Handlowego o 5% oraz zmniejsza calkowity koszt paliwa flot o 2% na poziom.',
      ESPIONAGE_TECHNOLOGY:
        'Ujawnia wiecej informacji z misji szpiegowskich i daje +2% zasiegu Sensor Phalanx do wykrywania nadlatujacych flot.',
      COMPUTER_TECHNOLOGY: 'Kazdy poziom daje +2 do maksymalnej liczby flot i +5% mocy badan.',
      ASTROPHYSICS_TECHNOLOGY:
        'Daje +5% dochodu z ekspedycji, zmniejsza zle wyniki ekspedycji o 2% i zwieksza zasieg Sensor Phalanx o 1%.',
      ADAPTIVE_TECHNOLOGY:
        'Odblokowuje kolejne typy planet do kolonizacji, zwieksza limit posiadanych planet na okreslonych poziomach oraz daje +1% do wszystkich dochodow surowcow, badan i przemyslu.',
      INTERGALACTIC_RESEARCH_NETWORK:
        'Pozwala wielu Laboratoriom badawczym pracowac nad jedna technologia i daje +2% lacznej mocy badan.',
      GRAVITON_TECHNOLOGY:
        'Daje 5% uniku statkow, zwieksza zasieg skoku o 1, zwieksza pojemnosc Jump Gate i Miedzygwiezdnego Portu Handlowego o 25% oraz zwieksza bazowy zasieg Sensor Phalanx o 0.5.',
      SHIELDING_TECHNOLOGY: 'Daje +10% do wytrzymalosci wszystkich tarcz.',
      ARMOUR_TECHNOLOGY:
        'Daje +10% do wytrzymalosci wszystkich kadlubow i zmniejsza szanse zniszczenia statku o 1%.',
      RAILGUNS_WEAPONS: 'Daje +10% do obrazen wszystkich broni RAIL_GUN.',
      BEAMS_WEAPONS: 'Daje +10% do obrazen wszystkich broni BEAM.',
      MISSILES_WEAPONS: 'Daje +10% do obrazen wszystkich broni MISSILE.',
      FUSION_DRIVE:
        'Zwieksza predkosc statkow w systemie o 1, zwieksza szanse uniku o 3% i zmniejsza calkowity koszt paliwa flot o 1% na poziom.',
      HYPERSPACE_DRIVE:
        'Zwieksza zasieg skoku o 1 i zmniejsza calkowity koszt paliwa flot o 1% na poziom.',
    },
  },
} as const;
