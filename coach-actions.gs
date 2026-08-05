/** ===========================================================================
 *  TRAINDERIVE — coach authoring actions for Code.gs
 *
 *  Paste this whole file at the bottom of the Code.gs inside each athlete's
 *  spreadsheet, then add two lines to your existing doPost() (see WIRING
 *  below) and re-deploy the Web App as a NEW VERSION.
 *
 *  Adds:
 *    action:'training'  → writes a workout into one Training cell
 *    action:'newWeek'   → appends a blank week block to the bottom of a tab
 *  =========================================================================== */


/* ── WIRING ─────────────────────────────────────────────────────────────────
   Inside your existing doPost(e), after the secret check and alongside your
   'results' / 'comment' branches, add:

     if (body.action === 'training') return tdWriteTraining(body);
     if (body.action === 'newWeek')  return tdCreateWeek(body);

   If your doPost uses a switch, add:

     case 'training': return tdWriteTraining(body);
     case 'newWeek':  return tdCreateWeek(body);
   ───────────────────────────────────────────────────────────────────────── */


/** Write a full day's programming into the Training cell. */
function tdWriteTraining(b) {
  try {
    if (String(b.secret) !== String(BLOC_SECRET)) return tdJson({ ok: false, error: 'Bad secret' });

    var sh = SpreadsheetApp.getActive().getSheetByName(b.sheetName);
    if (!sh) return tdJson({ ok: false, error: 'Sheet not found: ' + b.sheetName });

    var row = Number(b.trainingRowIdx) + 1;   // incoming index is 0-based
    var col = Number(b.colIndex) + 1;
    if (!(row > 1) || !(col > 0)) return tdJson({ ok: false, error: 'Bad row/column' });
    if (row > sh.getMaxRows() || col > sh.getMaxColumns())
      return tdJson({ ok: false, error: 'Row/column outside sheet' });

    // Safety: the cell directly above must still hold the date we think it does.
    // Stops a stale browser tab from writing a workout into the wrong day.
    if (b.expectDate) {
      var actual   = tdDayKey_(sh.getRange(row - 1, col).getValue());
      var expected = tdDayKey_(b.expectDate);
      if (expected && actual !== expected) {
        return tdJson({
          ok: false,
          error: 'Date mismatch — sheet has ' + (actual || 'no date') +
                 ' at that column, expected ' + expected + '. Refresh and try again.'
        });
      }
    }

    var text = String(b.text == null ? '' : b.text);
    if (text.length > 45000) return tdJson({ ok: false, error: 'Workout is too long for one cell' });

    var cell = sh.getRange(row, col);
    cell.setNumberFormat('@');               // keep it plain text, never a date/number
    cell.setValue(text);
    cell.setWrap(true).setVerticalAlignment('top');

    tdBumpChanged();
    return tdJson({ ok: true, sheet: b.sheetName, row: row, col: col, chars: text.length });
  } catch (err) {
    return tdJson({ ok: false, error: String(err) });
  }
}


/** Append a blank week block, copying the layout of an existing week. */
function tdCreateWeek(b) {
  try {
    if (String(b.secret) !== String(BLOC_SECRET)) return tdJson({ ok: false, error: 'Bad secret' });

    var sh = SpreadsheetApp.getActive().getSheetByName(b.sheetName);
    if (!sh) return tdJson({ ok: false, error: 'Sheet not found: ' + b.sheetName });

    var tRow = Number(b.templateRowIdx) + 1;          // date row of an existing week
    if (!(tRow > 0) || tRow > sh.getMaxRows())
      return tdJson({ ok: false, error: 'Bad template row' });

    var maxCols = sh.getMaxColumns();

    // Which columns in the template row actually hold dates?
    var head = sh.getRange(tRow, 1, 1, maxCols).getValues()[0];
    var cols = [];
    for (var i = 0; i < head.length; i++) if (tdDayKey_(head[i])) cols.push(i + 1);
    if (!cols.length) return tdJson({ ok: false, error: 'No date cells found in the template row' });

    // Where the new block goes: two rows below the last used row
    var target = sh.getLastRow() + 2;
    var need = (target + 4) - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);

    // Copy the 4-row block (dates / training / results / feel) for formatting
    sh.getRange(tRow, 1, 4, maxCols).copyTo(sh.getRange(target, 1, 4, maxCols));
    sh.getRange(target, 1, 4, maxCols).clearContent();

    // Restore the column-A labels of the training/results/feel rows
    var labels = sh.getRange(tRow + 1, 1, 3, 1).getValues();
    sh.getRange(target + 1, 1, 3, 1).setValues(labels);

    // Write the new date headers as plain text, e.g. "Mon, 03-16"
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var parts = String(b.startDate).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var count = Math.min(cols.length, Number(b.numDays || 7));
    var written = [];
    for (var j = 0; j < count; j++) {
      var label = DOW[d.getDay()] + ', ' + tdPad_(d.getMonth() + 1) + '-' + tdPad_(d.getDate());
      var c = sh.getRange(target, cols[j]);
      c.setNumberFormat('@');
      c.setValue(label);
      written.push(label);
      d.setDate(d.getDate() + 1);
    }

    tdBumpChanged();
    return tdJson({ ok: true, dateRowIdx: target - 1, dates: written });
  } catch (err) {
    return tdJson({ ok: false, error: String(err) });
  }
}


/* ── helpers ─────────────────────────────────────────────────────────────── */

function tdPad_(n) { return (n < 10 ? '0' : '') + n; }

/**
 * Normalise anything that might be a date header to "M/D", or null.
 * Handles real Date cells, "Mon, 03-16", "3/16" and the long JS date string.
 */
function tdDayKey_(v) {
  if (v instanceof Date) return (v.getMonth() + 1) + '/' + v.getDate();
  var s = String(v == null ? '' : v).trim();
  if (!s) return null;

  var MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                 jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  var full = s.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
  if (full) {
    var m = MONTHS[full[1].toLowerCase()];
    if (m) return m + '/' + parseInt(full[2], 10);
  }

  var short_ = s.replace(/^[a-z]{2,3},?\s*/i, '').match(/^(\d{1,2})[-\/](\d{1,2})$/);
  if (short_) {
    var mm = parseInt(short_[1], 10), dd = parseInt(short_[2], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return mm + '/' + dd;
  }
  return null;
}

/**
 * Bump the change timestamp the apps poll on.
 * IMPORTANT: script edits do not fire onEdit triggers, so this must be called
 * on every write. If your doGet reads lastChanged from somewhere else, change
 * this body to update that same place instead.
 */
function tdBumpChanged() {
  try {
    PropertiesService.getDocumentProperties()
      .setProperty('lastChanged', String(new Date().getTime()));
  } catch (e) {}
}
