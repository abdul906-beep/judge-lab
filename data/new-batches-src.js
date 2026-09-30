// Hand-written batches for the gap test (30 Sep). Each taste has a "close" set,
// where the three variants differ only in small details, and a "far" set,
// where one variant is clearly strongest and one clearly weakest.
// Prediction: whole-number scores tie often on "close" and rarely on "far".
// Built into the app by build-new-batches (rendered in the page, then saved
// to builtin-batches.json).

const SNOW_ARM = (w, ang, col) => `SETBG [8 16 40]
SETPC ${col}
SETWIDTH ${w}
TO ARM :S
FD :S
BK :S/3 LT ${ang} FD :S/3 BK :S/3 RT ${2*ang} FD :S/3 BK :S/3 LT ${ang}
BK :S/3 LT ${ang} FD :S/4 BK :S/4 RT ${2*ang} FD :S/4 BK :S/4 LT ${ang}
BK :S/3
END
REPEAT 6 [ARM 100 RT 60]`;

const CITY = (hs, moonX) => `SETBG [10 12 35]
SETWIDTH 2
TO BLD :W :H :N
SETPC [120 130 165]
PD FD :H RT 90 FD :W RT 90 FD :H LT 180
PU LT 90 FD :W RT 90
SETPC [255 215 110]
REPEAT :N [FD :H/(:N+1) RT 90 FD :W/3 DOT 3 FD :W/3 DOT 3 BK 2*:W/3 LT 90]
BK :N*:H/(:N+1)
RT 90 FD :W LT 90
END
PU SETXY -150 -80 SETH 0
${hs.map(h => `BLD 40 ${h} ${Math.max(2, Math.round(h/30))}`).join('\n')}
PU SETXY ${moonX} 150 SETPC [240 235 200] DOT 16`;

const GALAXY = (turn, cols, stars) => `SETBG BLACK
SETWIDTH 2
PU HOME SETH 0 PD SETPC ${cols[0]}
REPEAT 150 [FD REPCOUNT/12 RT ${turn}]
PU HOME SETH 180 PD SETPC ${cols[1]}
REPEAT 150 [FD REPCOUNT/12 RT ${turn}]
SETPC WHITE
${stars.map(([x, y]) => `PU SETXY ${x} ${y} DOT 2`).join('\n')}`;

const STARS = [[-140, 120], [130, 140], [150, -110], [-120, -140], [40, 160], [-160, 10], [170, 30]];

// Far sets are written strongest-first below, then reversed, so the strongest
// variant is listed LAST: if it wins, list order did not hand it the win.
const BATCHES = [
  { name: 'Snowflake - close', taste: 'Snowflake',
    parentCode: 'SETPC BLUE\nREPEAT 6 [FD 80 BK 80 RT 60]',
    variantCodes: [SNOW_ARM(3, 40, '[200 230 255]'),
                   SNOW_ARM(3, 45, '[200 230 255]'),
                   SNOW_ARM(4, 40, '[185 220 255]')] },
  { name: 'Snowflake - far', taste: 'Snowflake',
    parentCode: 'SETPC BLUE\nREPEAT 6 [FD 80 BK 80 RT 60]',
    variantCodes: [SNOW_ARM(3, 40, '[200 230 255]'),
                   'SETPC BLUE\nSETWIDTH 3\nREPEAT 6 [FD 80 LT 40 FD 20 BK 20 RT 80 FD 20 BK 20 LT 40 BK 80 RT 60]',
                   'SETPC BLUE\nSETWIDTH 3\nREPEAT 4 [FD 90 BK 90 RT 90]\nFD 40 RT 70 FD 60'] },

  { name: 'City skyline - close', taste: 'City skyline at night',
    parentCode: 'REPEAT 4 [FD 80 RT 90]',
    variantCodes: [CITY([120, 180, 90, 150, 110, 200, 130], 110),
                   CITY([130, 170, 90, 160, 110, 190, 130], 110),
                   CITY([120, 180, 100, 150, 110, 200, 120], 90)] },
  { name: 'City skyline - far', taste: 'City skyline at night',
    parentCode: 'REPEAT 4 [FD 80 RT 90]',
    variantCodes: [CITY([120, 180, 90, 150, 110, 200, 130], 110),
                   'SETPC GRAY\nSETWIDTH 2\nREPEAT 3 [REPEAT 2 [FD 120 RT 90 FD 50 RT 90] RT 90 FD 50 LT 90]',
                   'SETPC GRAY\nSETWIDTH 2\nREPEAT 4 [FD 80 RT 90]\nRT 30 FD 60'] },

  { name: 'Spiral galaxy - close', taste: 'Spiral galaxy',
    parentCode: 'REPEAT 36 [FD 5 RT 10]',
    variantCodes: [GALAXY(7, ['VIOLET', 'CYAN'], STARS),
                   GALAXY(7.5, ['VIOLET', 'CYAN'], STARS),
                   GALAXY(7, ['MAGENTA', 'CYAN'], STARS)] },
  { name: 'Spiral galaxy - far', taste: 'Spiral galaxy',
    parentCode: 'REPEAT 36 [FD 5 RT 10]',
    variantCodes: [GALAXY(7, ['VIOLET', 'CYAN'], STARS),
                   'SETPC VIOLET\nSETWIDTH 2\nREPEAT 150 [FD REPCOUNT/12 RT 7]',
                   'SETPC VIOLET\nSETWIDTH 2\nREPEAT 3 [REPEAT 36 [FD 5 RT 10] RT 120]'] },
];

BATCHES.forEach(b => { if (/far$/.test(b.name)) b.variantCodes.reverse(); });
module.exports = BATCHES;
