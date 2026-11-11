/* Axis Visits Supabase authentication and shared database adapter. */
(function () {
  'use strict';

  var config = window.AXIS_SUPABASE_CONFIG;
  var authGate = document.getElementById('authGate');
  var appShell = document.getElementById('appShell');
  var client = null;
  var lastSyncedState = null;
  var saveQueue = Promise.resolve();
  var notificationChannel = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function initials(first, last, email) {
    var a = (first || '').trim().charAt(0);
    var b = (last || '').trim().charAt(0);
    if (a || b) return (a + b).toUpperCase();
    return ((email || 'AV').slice(0, 2)).toUpperCase();
  }

  function profileName(profile) {
    var name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    return name || (profile.email || 'Axis Visits user').split('@')[0];
  }

  function authTypeFromUrl() {
    var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var search = new URLSearchParams(window.location.search);
    return hash.get('type') || search.get('type') || '';
  }

  function setGate(mode, message, emailValue) {
    appShell.hidden = true;
    authGate.hidden = false;
    authGate.setAttribute('aria-busy', 'false');
    var isReset = mode === 'reset';
    var isPassword = mode === 'set-password';
    var title = isReset ? 'Reset your password' : isPassword ? 'Choose a password' : 'Welcome back';
    var subtitle = isReset
      ? 'We will email you a secure link to reset your password.'
      : isPassword
        ? 'Set a password to finish securing your Axis Visits account.'
        : 'Sign in to access the shared Axis Visits workspace.';
    var fields = isPassword
      ? '<label class="auth-field"><span>New password</span><input name="password" type="password" autocomplete="new-password" minlength="8" required></label>' +
        '<label class="auth-field"><span>Confirm password</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>'
      : '<label class="auth-field"><span>Email</span><input name="email" type="email" autocomplete="email" value="' + escapeHtml(emailValue || '') + '" required></label>' +
        (isReset ? '' : '<label class="auth-field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>');
    var button = isPassword ? 'Save password' : isReset ? 'Send reset link' : 'Sign in';
    var back = isPassword
      ? ''
      : '<button class="auth-text-button" type="button" data-auth-mode="' + (isReset ? 'login' : 'reset') + '">' +
        (isReset ? 'Back to sign in' : 'Forgot password?') + '</button>';
    authGate.innerHTML =
      '<div class="auth-layout"><a class="auth-brand" href="./" aria-label="Axis Visits">' +
      '<img src="axis-logo-black.svg" alt="Axis Lighting"><span></span><b>VISITS</b></a>' +
      '<section class="auth-card"><p class="eyebrow">AXIS VISITS</p><h1>' + title + '</h1>' +
      '<p class="auth-subtitle">' + subtitle + '</p>' +
      (message ? '<p class="auth-message" role="status">' + escapeHtml(message) + '</p>' : '') +
      '<p class="auth-error" id="authError" role="alert" hidden></p>' +
      '<form id="authForm" data-auth-form="' + mode + '">' + fields +
      '<button class="primary-button auth-submit" type="submit">' + button + '</button>' + back + '</form>' +
      '<p class="auth-footnote">Access is limited to invited Axis Visits accounts.</p></section></div>';
    authGate.querySelector('input')?.focus();
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function setAuthError(message) {
    var error = document.getElementById('authError');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function showAuthFailure(error) {
    var message = error && error.message ? error.message : String(error || 'Unknown error');
    setGate('login', '');
    setAuthError(message);
  }

  function queryRows(table, column, values) {
    if (!values.length) return Promise.resolve([]);
    return client.from(table).select('*').in(column, values).then(function (result) {
      if (result.error) throw result.error;
      return result.data || [];
    });
  }

  function groupBy(rows, key) {
    return rows.reduce(function (groups, row) {
      (groups[row[key]] || (groups[row[key]] = [])).push(row);
      return groups;
    }, {});
  }

  async function loadBundle(session) {
    var user = session.user;
    var profileResult = await client.from('profiles')
      .select('id,email,first_name,last_name,global_role,is_active')
      .eq('id', user.id)
      .single();
    if (profileResult.error) throw profileResult.error;
    var profile = profileResult.data;
    if (!profile || !profile.is_active) {
      await client.auth.signOut();
      throw new Error('This Axis Visits account is inactive. Contact the workspace administrator.');
    }

    var peopleResult = await client.from('profiles')
      .select('id,email,first_name,last_name,global_role,is_active')
      .eq('is_active', true)
      .order('first_name', { ascending: true });
    if (peopleResult.error) throw peopleResult.error;
    var people = (peopleResult.data || []).map(function (row) {
      return {
        id: row.id,
        name: profileName(row),
        initials: initials(row.first_name, row.last_name, row.email),
        role: row.global_role,
        email: row.email
      };
    });

    var notificationResult = await client.from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (notificationResult.error) throw notificationResult.error;
    var notifications = (notificationResult.data || []).map(function (row) {
      return {
        id: row.id,
        userId: row.user_id,
        visitId: row.visit_id,
        category: row.category,
        title: row.title,
        message: row.message,
        createdAt: row.created_at,
        read: !!row.read_at
      };
    });

    var visitResult = await client.from('visits').select('*').order('start_date', { ascending: true });
    if (visitResult.error) throw visitResult.error;
    var visitRows = visitResult.data || [];
    var visitIds = visitRows.map(function (row) { return row.id; });
    var memberRows = await queryRows('visit_members', 'visit_id', visitIds);
    var guestRows = await queryRows('guests', 'visit_id', visitIds);
    var bookingRows = await queryRows('bookings', 'visit_id', visitIds);
    var activityRows = await queryRows('activity_log', 'visit_id', visitIds);
    var bookingIds = bookingRows.map(function (row) { return row.id; });
    var bookingGuestRows = await queryRows('booking_guests', 'booking_id', bookingIds);
    var segmentRows = await queryRows('flight_segments', 'booking_id', bookingIds);
    var hotelRows = await queryRows('hotel_guest_stays', 'booking_id', bookingIds);
    var attachmentRows = await queryRows('attachments', 'booking_id', bookingIds);

    var membersByVisit = groupBy(memberRows, 'visit_id');
    var guestsByVisit = groupBy(guestRows, 'visit_id');
    var bookingsByVisit = groupBy(bookingRows, 'visit_id');
    var activityByVisit = groupBy(activityRows, 'visit_id');
    var bookingGuestsByBooking = groupBy(bookingGuestRows, 'booking_id');
    var segmentsByBooking = groupBy(segmentRows, 'booking_id');
    var hotelsByBooking = groupBy(hotelRows, 'booking_id');
    var attachmentsByBooking = groupBy(attachmentRows, 'booking_id');

    var signedUrls = {};
    await Promise.all(attachmentRows.map(async function (row) {
      var result = await client.storage.from('booking-attachments').createSignedUrl(row.storage_path, 604800);
      if (!result.error && result.data) signedUrls[row.id] = result.data.signedUrl;
    }));

    var visits = visitRows.map(function (row) {
      var members = membersByVisit[row.id] || [];
      var guests = (guestsByVisit[row.id] || []).map(function (guest) {
        return {
          id: guest.id,
          profileId: guest.profile_id || null,
          firstName: guest.first_name,
          lastName: guest.last_name,
          email: guest.email,
          company: guest.company,
          status: guest.status,
          notes: guest.notes,
          formStatus: guest.guest_intake_completed_at ? 'complete' : guest.guest_questionnaire_sent_at ? 'sent' : 'not-sent',
          formCompletedAt: guest.guest_intake_completed_at || '',
          profile: {
            phone: guest.phone || '',
            title: guest.title || '',
            allergies: guest.allergies || '',
            favoriteDrink: guest.favorite_drink || '',
            birthday: guest.birthday || '',
            socialMediaConsent: !!guest.social_media_consent,
            preferredName: guest.preferred_name || '',
            whereBased: guest.where_based || '',
            preferredLanguage: guest.preferred_language || 'English',
            specialRequest: guest.special_request || '',
            travelMode: guest.travel_mode || 'Plane'
          }
        };
      });
      var bookings = (bookingsByVisit[row.id] || []).map(function (booking) {
        var details = Object.assign({}, booking.details || {});
        var links = bookingGuestsByBooking[booking.id] || [];
        var segments = (segmentsByBooking[booking.id] || []).slice()
          .sort(function (a, b) { return a.segment_order - b.segment_order; })
          .map(function (segment) {
            return {
              id: segment.id,
              from: segment.origin,
              to: segment.destination,
              flight: segment.flight_number,
              airline: segment.airline,
              date: segment.segment_date || '',
              time: segment.departure_time || ''
            };
          });
        var stays = {};
        (hotelsByBooking[booking.id] || []).forEach(function (stay) {
          stays[stay.guest_id] = { id: stay.id, checkIn: stay.check_in || '', checkOut: stay.check_out || '' };
        });
        if (booking.booking_type === 'Flight') details.segments = segments;
        if (booking.booking_type === 'Hotel') details.stays = stays;
        return {
          id: booking.id,
          type: booking.booking_type,
          name: booking.name,
          status: booking.status,
          date: booking.booking_date || '',
          time: booking.booking_time || '',
          location: booking.location,
          endDate: booking.end_date || '',
          guestIds: links.map(function (link) { return link.guest_id; }),
          details: details,
          needsReview: booking.needs_review,
          reviewReason: booking.review_reason,
          createdBy: booking.created_by,
          attachments: (attachmentsByBooking[booking.id] || []).map(function (attachment) {
            return {
              id: attachment.id,
              name: attachment.file_name,
              type: attachment.mime_type,
              size: attachment.size_bytes,
              storagePath: attachment.storage_path,
              data: signedUrls[attachment.id] || ''
            };
          })
        };
      });
      var activity = (activityByVisit[row.id] || []).slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
        .map(function (entry) {
          return {
            id: entry.id,
            actorId: entry.actor_id,
            actor: entry.actor_name,
            action: entry.action,
            detail: entry.detail,
            at: entry.created_at
          };
        });
      return {
        id: row.id,
        name: row.name,
        city: row.city,
        country: row.country,
        startDate: row.start_date || '',
        endDate: row.end_date || '',
        status: row.status,
        lead: row.lead_vp_id,
        travelGuidePublishedAt: row.travel_guide_published_at || '',
        collaborators: members.filter(function (member) { return member.visit_role === 'COLLABORATING_VP'; }).map(function (member) { return member.user_id; }),
        sales: members.filter(function (member) { return member.visit_role === 'SALES'; }).map(function (member) { return member.user_id; }),
        archived: row.archived,
        theme: row.theme,
        createdBy: row.created_by,
        guests: guests,
        bookings: bookings,
        activity: activity
      };
    });

    var state = { version: 2, role: profile.global_role, visits: visits, notifications: notifications };
    lastSyncedState = clone(state);
    return { session: session, user: user, profile: profile, people: people, state: state };
  }

  function keyFor(row, keys) {
    return keys.map(function (key) { return String(row[key]); }).join('|');
  }

  function equalRow(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  async function deleteRows(table, rows, keys) {
    for (var i = 0; i < rows.length; i += 1) {
      var match = {};
      keys.forEach(function (key) { match[key] = rows[i][key]; });
      var result = await client.from(table).delete().match(match);
      if (result.error) throw result.error;
    }
  }

  async function syncRows(table, before, after, keys, options) {
    options = options || {};
    var oldMap = new Map(before.map(function (row) { return [keyFor(row, keys), row]; }));
    var newMap = new Map(after.map(function (row) { return [keyFor(row, keys), row]; }));
    var removed = [];
    var changed = [];
    before.forEach(function (row) {
      var key = keyFor(row, keys);
      var next = newMap.get(key);
      if (!next || !equalRow(row, next)) removed.push(row);
    });
    after.forEach(function (row) {
      var key = keyFor(row, keys);
      var previous = oldMap.get(key);
      if (!previous || !equalRow(previous, row)) changed.push(row);
    });
    if (options.appendOnly) {
      changed = after.filter(function (row) { return !oldMap.has(keyFor(row, keys)); });
      removed = [];
    }
    if (options.setOnly) {
      await deleteRows(table, removed, keys);
    } else if (!options.appendOnly) {
      await deleteRows(table, removed, keys);
    }
    if (changed.length) {
      var result = await client.from(table).upsert(changed, { onConflict: keys.join(',') });
      if (result.error) throw result.error;
    }
  }

  function flattenState(state, userId) {
    var rows = {
      visits: [],
      visit_members: [],
      guests: [],
      bookings: [],
      booking_guests: [],
      flight_segments: [],
      hotel_guest_stays: [],
      attachments: [],
      activity_log: []
    };
    (state.visits || []).forEach(function (visit) {
      rows.visits.push({
        id: visit.id,
        name: visit.name,
        city: visit.city || '',
        country: visit.country || '',
        start_date: visit.startDate || null,
        end_date: visit.endDate || null,
        status: visit.status,
        lead_vp_id: visit.lead,
        travel_guide_published_at: visit.travelGuidePublishedAt || null,
        archived: !!visit.archived,
        theme: visit.theme || 'terracotta',
        created_by: visit.createdBy || userId
      });
      (visit.collaborators || []).forEach(function (id) {
        rows.visit_members.push({ visit_id: visit.id, user_id: id, visit_role: 'COLLABORATING_VP' });
      });
      (visit.sales || []).forEach(function (id) {
        rows.visit_members.push({ visit_id: visit.id, user_id: id, visit_role: 'SALES' });
      });
      (visit.guests || []).forEach(function (guest) {
        rows.guests.push({
          id: guest.id,
          visit_id: visit.id,
          profile_id: guest.profileId || null,
          first_name: guest.firstName,
          last_name: guest.lastName,
          email: guest.email || '',
          company: guest.company || '',
          status: guest.status || 'Invited',
          notes: guest.notes || '',
          phone: guest.profile && guest.profile.phone || '',
          title: guest.profile && guest.profile.title || '',
          allergies: guest.profile && guest.profile.allergies || '',
          favorite_drink: guest.profile && guest.profile.favoriteDrink || '',
          birthday: guest.profile && guest.profile.birthday || null,
          social_media_consent: !!(guest.profile && guest.profile.socialMediaConsent),
          preferred_name: guest.profile && guest.profile.preferredName || '',
          where_based: guest.profile && guest.profile.whereBased || '',
          preferred_language: guest.profile && guest.profile.preferredLanguage || 'English',
          special_request: guest.profile && guest.profile.specialRequest || '',
          travel_mode: guest.profile && guest.profile.travelMode || 'Plane',
          guest_questionnaire_sent_at: guest.formSentAt || null,
          guest_intake_completed_at: guest.formCompletedAt || null
        });
      });
      (visit.bookings || []).forEach(function (booking) {
        rows.bookings.push({
          id: booking.id,
          visit_id: visit.id,
          booking_type: booking.type,
          name: booking.name,
          status: booking.status || 'To Do',
          booking_date: booking.date || null,
          booking_time: booking.time || null,
          location: booking.location || '',
          end_date: booking.endDate || null,
          details: booking.details || {},
          needs_review: !!booking.needsReview,
          review_reason: booking.reviewReason || '',
          created_by: booking.createdBy || userId
        });
        (booking.guestIds || []).forEach(function (guestId) {
          rows.booking_guests.push({ booking_id: booking.id, guest_id: guestId });
        });
        if (booking.type === 'Flight') {
          (booking.details && booking.details.segments || []).forEach(function (segment, index) {
            rows.flight_segments.push({
              id: segment.id || makeUuid(),
              booking_id: booking.id,
              segment_order: index + 1,
              origin: segment.from || '',
              destination: segment.to || '',
              flight_number: segment.flight || '',
              airline: segment.airline || '',
              segment_date: segment.date || null,
              departure_time: segment.time || null
            });
          });
        }
        if (booking.type === 'Hotel') {
          var stays = booking.details && booking.details.stays || {};
          (booking.guestIds || []).forEach(function (guestId) {
            var stay = stays[guestId] || {};
            if (stay.checkIn || stay.checkOut || booking.details.checkIn || booking.details.checkOut) {
              rows.hotel_guest_stays.push({
                id: stay.id || makeUuid(),
                booking_id: booking.id,
                guest_id: guestId,
                check_in: stay.checkIn || booking.details.checkIn || null,
                check_out: stay.checkOut || booking.details.checkOut || null
              });
            }
          });
        }
        (booking.attachments || []).forEach(function (attachment) {
          if (!attachment.storagePath) return;
          rows.attachments.push({
            id: attachment.id,
            booking_id: booking.id,
            storage_path: attachment.storagePath,
            file_name: attachment.name,
            mime_type: attachment.type || 'application/octet-stream',
            size_bytes: attachment.size || 1,
            uploaded_by: userId
          });
        });
      });
      (visit.activity || []).forEach(function (entry) {
        rows.activity_log.push({
          id: entry.id,
          visit_id: visit.id,
          actor_id: entry.actorId || userId,
          actor_name: entry.actor || '',
          action: entry.action,
          detail: entry.detail || '',
          created_at: entry.at || new Date().toISOString()
        });
      });
    });
    return rows;
  }

  function makeUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.random() * 16 | 0;
      return (character === 'x' ? random : (random & 3 | 8)).toString(16);
    });
  }

  function safeFileName(name) {
    return String(name || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100);
  }

  async function uploadNewAttachments(state) {
    for (var i = 0; i < state.visits.length; i += 1) {
      var visit = state.visits[i];
      for (var j = 0; j < visit.bookings.length; j += 1) {
        var booking = visit.bookings[j];
        for (var k = 0; k < (booking.attachments || []).length; k += 1) {
          var attachment = booking.attachments[k];
          if (attachment.storagePath || !attachment.data || !attachment.data.startsWith('data:')) continue;
          var blob = await fetch(attachment.data).then(function (response) { return response.blob(); });
          if (!blob.size || blob.size > 512000) throw new Error('Attachments must be 500 KB or smaller.');
          var mimeType = attachment.type || blob.type || 'application/octet-stream';
          if (['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(mimeType) < 0) {
            throw new Error('Choose a PDF, JPEG, PNG, GIF, or WebP file.');
          }
          var path = visit.id + '/' + booking.id + '/' + attachment.id + '-' + safeFileName(attachment.name);
          var upload = await client.storage.from('booking-attachments').upload(path, blob, {
            contentType: mimeType,
            upsert: true
          });
          if (upload.error) throw upload.error;
          attachment.storagePath = path;
          attachment.size = blob.size;
          if (window.axisAppSetAttachmentPath) window.axisAppSetAttachmentPath(attachment.id, path, blob.size);
        }
      }
    }
  }

  async function syncState(nextState, userId) {
    var previousRows = flattenState(lastSyncedState || { visits: [] }, userId);
    var previousVisitIds = new Set((lastSyncedState && lastSyncedState.visits || []).map(function (visit) { return visit.id; }));
    var createdVisits = (nextState.visits || []).filter(function (visit) { return !previousVisitIds.has(visit.id); });
    await uploadNewAttachments(nextState);
    var nextRows = flattenState(nextState, userId);
    var nextPaths = new Set(nextRows.attachments.map(function (row) { return row.storage_path; }));
    var removedPaths = previousRows.attachments
      .map(function (row) { return row.storage_path; })
      .filter(function (path) { return !nextPaths.has(path); });
    if (removedPaths.length) {
      var removal = await client.storage.from('booking-attachments').remove(removedPaths);
      if (removal.error) throw removal.error;
    }

    await syncRows('visits', previousRows.visits, nextRows.visits, ['id']);
    await syncRows('visit_members', previousRows.visit_members, nextRows.visit_members, ['visit_id', 'user_id'], { setOnly: true });
    for (var createdIndex = 0; createdIndex < createdVisits.length; createdIndex += 1) {
      var notificationResult = await client.rpc('notify_visit_team', { target_visit_id: createdVisits[createdIndex].id });
      if (notificationResult.error) throw notificationResult.error;
    }
    await syncRows('guests', previousRows.guests, nextRows.guests, ['id']);
    await syncRows('bookings', previousRows.bookings, nextRows.bookings, ['id']);
    await syncRows('booking_guests', previousRows.booking_guests, nextRows.booking_guests, ['booking_id', 'guest_id'], { setOnly: true });
    await syncRows('flight_segments', previousRows.flight_segments, nextRows.flight_segments, ['booking_id', 'segment_order']);
    await syncRows('hotel_guest_stays', previousRows.hotel_guest_stays, nextRows.hotel_guest_stays, ['booking_id', 'guest_id']);
    await syncRows('attachments', previousRows.attachments, nextRows.attachments, ['id'], { setOnly: true });
    await syncRows('activity_log', previousRows.activity_log, nextRows.activity_log, ['id'], { appendOnly: true });
  }

  async function saveState(state) {
    var snapshot = clone(state);
    var currentUser = client && (await client.auth.getUser()).data.user;
    if (!currentUser) throw new Error('Your session has expired. Sign in again before saving.');
    saveQueue = saveQueue.catch(function () {}).then(async function () {
      await syncState(snapshot, currentUser.id);
      lastSyncedState = clone(snapshot);
    });
    return saveQueue;
  }

  async function markNotificationsRead(notificationIds) {
    if (!client || !notificationIds || !notificationIds.length) return;
    var userResult = await client.auth.getUser();
    var user = userResult.data && userResult.data.user;
    if (!user) return;
    var result = await client.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', notificationIds)
      .eq('user_id', user.id);
    if (result.error) throw result.error;
  }

  async function subscribeNotifications(onInsert) {
    if (!client || typeof onInsert !== 'function') return;
    var userResult = await client.auth.getUser();
    var user = userResult.data && userResult.data.user;
    if (!user) return;
    if (notificationChannel) await client.removeChannel(notificationChannel);
    notificationChannel = client.channel('axis-visits-notifications-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + user.id
      }, function (payload) {
        if (payload && payload.new) onInsert(payload.new);
      })
      .subscribe();
  }

  async function buildBundle(session) {
    var bundle = await loadBundle(session);
    lastSyncedState = clone(bundle.state);
    return bundle;
  }

  function authReturnUrl() {
    return window.location.origin + window.location.pathname;
  }

  async function start() {
    appShell.hidden = true;
    if (!config || !window.supabase || !window.supabase.createClient) {
      setGate('login', 'Supabase could not load. Check your internet connection and refresh.');
      return null;
    }
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
    var linkType = authTypeFromUrl();
    var result = await client.auth.getSession();
    if (result.error) {
      showAuthFailure(result.error);
      return null;
    }
    if (!result.data.session) {
      setGate('login', linkType === 'invite'
        ? 'Your invitation was confirmed. Use Forgot password? to set a password for this account.'
        : '');
      return null;
    }
    if (linkType === 'invite' || linkType === 'recovery') {
      setGate('set-password', 'Your secure account link is ready.');
      return null;
    }
    try {
      return await buildBundle(result.data.session);
    } catch (error) {
      showAuthFailure(error);
      return null;
    }
  }

  authGate.addEventListener('click', function (event) {
    var button = event.target.closest('[data-auth-mode]');
    if (!button) return;
    event.preventDefault();
    setGate(button.dataset.authMode, '');
  });

  authGate.addEventListener('submit', async function (event) {
    if (event.target.id !== 'authForm') return;
    event.preventDefault();
    if (!client) return;
    var form = event.target;
    var mode = form.dataset.authForm;
    var data = new FormData(form);
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Please wait…';
    setAuthError('');
    try {
      if (mode === 'login') {
        var signIn = await client.auth.signInWithPassword({
          email: String(data.get('email') || '').trim(),
          password: String(data.get('password') || '')
        });
        if (signIn.error) throw signIn.error;
        window.axisAppActivate(await buildBundle(signIn.data.session));
      } else if (mode === 'reset') {
        var reset = await client.auth.resetPasswordForEmail(String(data.get('email') || '').trim(), {
          redirectTo: authReturnUrl()
        });
        if (reset.error) throw reset.error;
        setGate('login', 'If that account exists, a password reset link is on its way.');
      } else if (mode === 'set-password') {
        var password = String(data.get('password') || '');
        var confirmation = String(data.get('confirmPassword') || '');
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (password !== confirmation) throw new Error('The passwords do not match.');
        var update = await client.auth.updateUser({ password: password });
        if (update.error) throw update.error;
        window.history.replaceState({}, document.title, authReturnUrl());
        var current = await client.auth.getSession();
        if (!current.data.session) throw new Error('Your session expired. Request another password reset link.');
        window.axisAppActivate(await buildBundle(current.data.session));
      }
    } catch (error) {
      setAuthError(error.message || 'Something went wrong. Try again.');
      button.disabled = false;
      button.textContent = mode === 'set-password' ? 'Save password' : mode === 'reset' ? 'Send reset link' : 'Sign in';
    }
  });

  window.AxisSupabaseBackend = {
    start: start,
    saveState: saveState,
    markNotificationsRead: markNotificationsRead,
    subscribeNotifications: subscribeNotifications,
    inviteTeamMember: async function (payload) {
      if (!client) throw new Error('Sign in before inviting a team member.');
      var result = await client.functions.invoke('invite-team-member', { body: payload });
      if (result.error) {
        var response = result.error.context;
        if (response && typeof response.clone === 'function') {
          try {
            var body = await response.clone().json();
            if (body && body.error) throw new Error(body.error);
          } catch (error) {
            if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error;
          }
        }
        throw result.error;
      }
      return result.data;
    },
    signOut: async function () {
      if (client) await client.auth.signOut();
      window.location.reload();
    },
    getClient: function () { return client; }
  };
})();
