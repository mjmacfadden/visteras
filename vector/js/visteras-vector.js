// Visteras Vector UI Bridge & Extensions
(function() {
  function initVisterasVector() {
    // 1. Hook up Options Bar Undo / Redo / Delete
    $('#opt_undo').on('click', function() {
      if (typeof svgCanvas !== 'undefined' && svgCanvas.undo) {
        svgCanvas.undo();
      } else {
        $('#tool_undo').click();
      }
    });

    $('#opt_redo').on('click', function() {
      if (typeof svgCanvas !== 'undefined' && svgCanvas.redo) {
        svgCanvas.redo();
      } else {
        $('#tool_redo').click();
      }
    });

    $('#opt_delete').on('click', function() {
      if (typeof svgCanvas !== 'undefined' && svgCanvas.deleteSelectedElements) {
        svgCanvas.deleteSelectedElements();
      } else {
        $('#tool_delete').click();
      }
    });

    // 2. Options Bar Zoom dropdown
    $('#header_zoom_select').on('change', function() {
      const val = parseFloat(this.value);
      if (!isNaN(val) && typeof svgCanvas !== 'undefined' && svgCanvas.setZoom) {
        svgCanvas.setZoom(val / 100);
        if (editor && editor.zoom && editor.zoom.changed) {
          editor.zoom.changed(window, { zoom: val / 100 });
        }
      }
    });

    // Sync header zoom when canvas is zoomed
    if (typeof svgCanvas !== 'undefined') {
      svgCanvas.bind('zoomed', function(win, bbox) {
        const zoom = svgCanvas.getZoom();
        const pct = Math.round(zoom * 100);
        $('#header_zoom_select').val(pct);
        if ($('#header_zoom_select').val() != pct) {
          // If not in standard dropdown options, add temporary or select closest
          $('#header_zoom_select option.custom_zoom').remove();
          $('#header_zoom_select').append('<option class="custom_zoom" value="' + pct + '">' + pct + '%</option>');
          $('#header_zoom_select').val(pct);
        }
      });

      // Update quick stats in options bar when selection changes
      svgCanvas.bind('selected', function(win, elems) {
        const selected = elems.filter(Boolean);
        const container = $('#options_dynamic');
        container.empty();

        if (selected.length === 1) {
          const elem = selected[0];
          const bbox = svgCanvas.getStrokedBBox([elem]);
          if (bbox) {
            container.append(
              '<div class="options_quick_stat"><span>W:</span> <span class="val">' + Math.round(bbox.width) + 'px</span></div>' +
              '<div class="options_quick_stat"><span>H:</span> <span class="val">' + Math.round(bbox.height) + 'px</span></div>' +
              '<div class="options_quick_stat"><span>X:</span> <span class="val">' + Math.round(bbox.x) + 'px</span></div>' +
              '<div class="options_quick_stat"><span>Y:</span> <span class="val">' + Math.round(bbox.y) + 'px</span></div>'
            );
          }
        } else if (selected.length > 1) {
          container.append(
            '<div class="options_quick_stat"><span class="val">' + selected.length + ' objects selected</span></div>'
          );
        } else {
          // No selection: show document size
          const res = svgCanvas.getResolution();
          container.append(
            '<div class="options_quick_stat"><span>Artboard:</span> <span class="val">' + Math.round(res.w) + ' × ' + Math.round(res.h) + 'px</span></div>'
          );
        }
      });
    }

    // Force canvas recalculation to center artboard inside middle area
    setTimeout(function() {
      if (typeof editor !== 'undefined' && editor.canvas && editor.canvas.update) {
        editor.canvas.update(true);
      }
      if (typeof editor !== 'undefined' && editor.rulers && editor.rulers.update) {
        editor.rulers.update();
      }
      if (typeof svgCanvas !== 'undefined' && svgCanvas.getResolution) {
        const res = svgCanvas.getResolution();
        if ($('#options_dynamic').children().length === 0) {
          $('#options_dynamic').html(
            '<div class="options_quick_stat"><span>Artboard:</span> <span class="val">' + Math.round(res.w) + ' × ' + Math.round(res.h) + 'px</span></div>'
          );
        }
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisterasVector);
  } else {
    initVisterasVector();
  }
})();
