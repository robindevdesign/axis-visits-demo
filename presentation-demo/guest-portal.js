(function () {
  'use strict';

  var STORE_KEY = 'axis-visits-presentation-demo-v1';
  var params = new URLSearchParams(window.location.search);
  var currentLocale = 'en-US';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function readState() {
    try {
      var state = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return state && Array.isArray(state.visits) ? state : null;
    } catch (error) {
      return null;
    }
  }

  function saveState(state) {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function findGuest(state, token, tokenField) {
    for (var i = 0; i < state.visits.length; i += 1) {
      var visit = state.visits[i];
      for (var j = 0; j < (visit.guests || []).length; j += 1) {
        var guest = visit.guests[j];
        if (guest[tokenField] === token) return { visit: visit, guest: guest };
      }
    }
    return null;
  }

  function dateLabel(value, options) {
    if (!value) return currentLocale === 'fr-CA' ? 'À confirmer' : 'To be confirmed';
    return new Intl.DateTimeFormat(currentLocale, options || { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value + 'T12:00:00'));
  }

  function say(english, french) {
    return currentLocale === 'fr-CA' ? french : english;
  }

  function guestName(guest) {
    return guest.profile && guest.profile.preferredName || guest.firstName || 'Guest';
  }

  function renderShell(content) {
    document.title = 'Axis Visits · Guest access';
    document.body.classList.add('guest-public-mode');
    document.getElementById('appShell').hidden = true;
    var gate = document.getElementById('authGate');
    gate.hidden = false;
    gate.innerHTML = '<main class="guest-public-shell"><a class="guest-public-brand" href="#" aria-label="Axis Lighting"><img src="axis-logo-black.svg" alt="Axis Lighting"><span></span><b>VISITS</b></a>' +
      '<div class="guest-demo-note"><strong>Demo preview</strong><span>This private guest page is separate from the Axis Visits dashboard. Demo data stays in this browser.</span></div>' + content +
      '<footer class="guest-public-footer">Axis Lighting · Axis Visits</footer></main>';
  }

  function invalidPage() {
    renderShell('<section class="guest-public-card"><p class="eyebrow">GUEST ACCESS</p><h1>Link unavailable</h1><p>This demo link is missing or no longer matches data saved in this browser. Return to the demo workspace and create a fresh link.</p></section>');
  }

  function profileForm(found) {
    var guest = found.guest;
    var profile = guest.profile || {};
    var language = profile.preferredLanguage || 'English';
    var fullName = [guest.firstName, guest.lastName].filter(Boolean).join(' ');
    renderShell('<section class="guest-public-card"><p class="eyebrow">GUEST INFORMATION</p><h1>Help us prepare for your visit</h1><p class="guest-public-intro">Please review your name and email, then share the details Axis Lighting needs to plan your experience.</p>' +
      '<div class="guest-identity"><strong>' + esc(fullName) + '</strong><span>' + esc(guest.email) + '</span><small>' + esc(found.visit.name) + ' · ' + esc(found.visit.city || 'Destination to be confirmed') + '</small></div>' +
      '<form id="guestProfileForm" class="guest-profile-form">' +
      '<div class="guest-form-grid">' +
      '<label><span>Phone number / Téléphone</span><input name="phone" type="tel" autocomplete="tel" value="' + esc(profile.phone) + '" required></label>' +
      '<label><span>Preferred name / Nom utilisé</span><input name="preferredName" autocomplete="nickname" value="' + esc(profile.preferredName) + '" required></label>' +
      '<label><span>Company / Entreprise</span><input name="company" value="' + esc(profile.company || guest.company) + '" required></label>' +
      '<label><span>Title / Fonction</span><input name="title" value="' + esc(profile.title) + '" required></label>' +
      '<label><span>Where are you based? / Où habitez-vous?</span><input name="whereBased" value="' + esc(profile.whereBased) + '" placeholder="City, country" required></label>' +
      '<label><span>Preferred language / Langue préférée</span><select name="preferredLanguage" required><option value="English" ' + (language === 'English' ? 'selected' : '') + '>English</option><option value="French" ' + (language === 'French' ? 'selected' : '') + '>French</option></select></label>' +
      '<label><span>Birthday / Anniversaire</span><input name="birthday" type="date" value="' + esc(profile.birthday) + '"></label>' +
      '<label><span>Favorite drink / Boisson préférée</span><input name="favoriteDrink" value="' + esc(profile.favoriteDrink) + '"></label>' +
      '<label class="guest-field-wide"><span>Allergies or dietary requirements / Allergies ou restrictions alimentaires</span><textarea name="allergies" rows="3" placeholder="Write none if not applicable">' + esc(profile.allergies) + '</textarea></label>' +
      '<label class="guest-field-wide"><span>Special requests / Demandes spéciales</span><textarea name="specialRequest" rows="3"></textarea></label>' +
      '<label class="guest-field-wide"><span>How will you travel to the visit? / Comment vous rendrez-vous à la visite?</span><select name="travelMode"><option value="Plane" ' + ((profile.travelMode || 'Plane') === 'Plane' ? 'selected' : '') + '>Plane / Avion</option><option value="Car" ' + (profile.travelMode === 'Car' ? 'selected' : '') + '>Car / Voiture</option><option value="Other" ' + (profile.travelMode === 'Other' ? 'selected' : '') + '>Other / Autre</option></select></label>' +
      '<label class="guest-consent"><input name="socialMediaConsent" type="checkbox" ' + (profile.socialMediaConsent ? 'checked' : '') + '><span>I consent to Axis Lighting using photos or videos of me on its social media channels. This is optional. / Photos et vidéos sur les réseaux sociaux : autorisation facultative.</span></label>' +
      '</div><p class="guest-privacy-note">Your answers will be shared with the Axis Visits team coordinating this event. A guest link does not create a dashboard account.</p>' +
      '<button class="primary-button guest-submit-button" type="submit">Save my information / Enregistrer mes renseignements</button></form></section>');

    document.getElementById('guestProfileForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      guest.profile = {
        phone: String(data.get('phone') || '').trim(),
        preferredName: String(data.get('preferredName') || '').trim(),
        company: String(data.get('company') || '').trim(),
        title: String(data.get('title') || '').trim(),
        whereBased: String(data.get('whereBased') || '').trim(),
        preferredLanguage: String(data.get('preferredLanguage') || 'English'),
        birthday: String(data.get('birthday') || ''),
        favoriteDrink: String(data.get('favoriteDrink') || '').trim(),
        allergies: String(data.get('allergies') || '').trim(),
        specialRequest: String(data.get('specialRequest') || '').trim(),
        travelMode: String(data.get('travelMode') || 'Plane'),
        socialMediaConsent: form.querySelector('[name="socialMediaConsent"]').checked
      };
      guest.company = guest.profile.company;
      guest.formStatus = 'complete';
      guest.formCompletedAt = new Date().toISOString();
      saveState(found.state);
      thanksPage(found);
    });
  }

  function thanksPage(found) {
    currentLocale = found.guest.profile && found.guest.profile.preferredLanguage === 'French' ? 'fr-CA' : 'en-US';
    var guideReady = !!(found.visit.travelGuidePublishedAt && found.guest.guideToken);
    var guideUrl = new URL(window.location.href);
    guideUrl.search = '?demo=guest&guide=' + encodeURIComponent(found.guest.guideToken || '');
    guideUrl.hash = '';
    renderShell('<section class="guest-public-card guest-thanks"><p class="eyebrow">' + say('INFORMATION RECEIVED', 'RENSEIGNEMENTS REÇUS') + '</p><h1>' + say('Thank you, ', 'Merci, ') + esc(guestName(found.guest)) + '.</h1><p>' + say('Your information has been saved for ', 'Vos renseignements ont été enregistrés pour ') + '<strong>' + esc(found.visit.name) + '</strong>' + say('. The Axis team can now use it to prepare your visit.', '. L’équipe Axis pourra maintenant préparer votre visite.') + '</p>' +
      (guideReady ? '<a class="primary-button guest-guide-link" href="' + esc(guideUrl.href) + '">' + say('Open your travel guide', 'Ouvrir votre guide de voyage') + '</a>' : '<div class="guest-wait-note"><strong>' + say('Your travel guide is not published yet.', 'Votre guide de voyage n’est pas encore publié.') + '</strong><span>' + say('Axis will share a separate link when the visit plans are ready.', 'Axis vous enverra un lien lorsque les préparatifs seront prêts.') + '</span></div>') +
      '<p class="guest-privacy-note">' + say('You do not need an Axis Visits dashboard account.', 'Vous n’avez pas besoin d’un compte au tableau de bord Axis Visits.') + '</p></section>');
  }
  function itemHeading(booking) {
    return '<h3>' + esc(booking.name || booking.type) + '</h3>';
  }

  function mapsSearchUrl(query) {
    var url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1');
    url.searchParams.set('query', query);
    return url.href;
  }

  function mapsDirectionsUrl(origin, destination) {
    var url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    return url.href;
  }

  function flightSearchUrl(flight) {
    var url = new URL('https://www.google.com/search');
    url.searchParams.set('q', 'flight status ' + flight);
    return url.href;
  }

  function placeLink(place, visit, compact) {
    if (!place) return '';
    var query = [place, visit.city, visit.country].filter(Boolean).join(', ');
    return '<a class="guide-place-link' + (compact ? ' compact' : '') + '" href="' + esc(mapsSearchUrl(query)) + '" target="_blank" rel="noopener noreferrer"><span class="guide-place-pin">&#9679;</span><span>' + esc(place) + '</span><span class="guide-place-open">' + say('Map', 'Carte') + ' &#8599;</span></a>';
  }

  function bookingDetails(booking, guest, visit) {
    var details = booking.details || {};
    var rows = [];
    var actions = [];
    if (booking.type === 'Flight') {
      (details.segments || []).forEach(function (segment, index) {
        var route = [segment.from, segment.to].filter(Boolean).join(' \u2192 ');
        rows.push('<div class="guide-flight"><span class="guide-flight-step">' + say('LEG ', 'VOL ') + (index + 1) + '</span><strong>' + esc(route || say('Route to be confirmed', 'Trajet \u00e0 confirmer')) + '</strong><small>' + esc(segment.flight || say('Flight number to be confirmed', 'Num\u00e9ro de vol \u00e0 confirmer')) + (segment.airline ? ' &middot; ' + esc(segment.airline) : '') + (segment.date ? ' &middot; ' + esc(dateLabel(segment.date)) : '') + (segment.time ? ' &middot; ' + esc(segment.time) : '') + '</small>' + (segment.flight ? '<a class="guide-text-action" href="' + esc(flightSearchUrl(segment.flight)) + '" target="_blank" rel="noopener noreferrer">' + say('Check flight status', 'Suivre le vol') + ' &#8599;</a>' : '') + '</div>');
      });
      if (!rows.length) rows.push('<p class="guide-pending-copy">' + say('Your flight information is being finalized.', 'Les d\u00e9tails du vol sont en pr\u00e9paration.') + '</p>');
    } else if (booking.type === 'Hotel') {
      var stay = details.stays && details.stays[guest.id] || {};
      var checkIn = stay.checkIn || details.checkIn || booking.date;
      var checkOut = stay.checkOut || details.checkOut || booking.endDate;
      if (booking.location) rows.push(placeLink(booking.location, visit, false));
      rows.push('<div class="guide-stay-dates"><div><span>' + say('CHECK-IN', 'ARRIV\u00c9E') + '</span><strong>' + esc(dateLabel(checkIn, { weekday: 'short', month: 'short', day: 'numeric' })) + '</strong></div><div><span>' + say('CHECK-OUT', 'D\u00c9PART') + '</span><strong>' + esc(dateLabel(checkOut, { weekday: 'short', month: 'short', day: 'numeric' })) + '</strong></div></div>');
      if (details.confirmationNumber || details.reference) rows.push('<p class="guide-confirmation">' + say('Confirmation number', 'Num\u00e9ro de confirmation') + ' <strong>' + esc(details.confirmationNumber || details.reference) + '</strong></p>');
      if (details.lateCheckout) rows.push('<p class="guide-note-line">' + say('Late checkout requested', 'D\u00e9part tardif demand\u00e9') + '</p>');
    } else {
      if (booking.location) rows.push(placeLink(booking.location, visit, false));
      if (booking.type === 'Transportation') {
        var origin = details.origin || '';
        var destination = details.destination || '';
        if (origin || destination) rows.push('<p class="guide-route-copy">' + esc(origin || say('Pickup point to be confirmed', 'Lieu de d\u00e9part \u00e0 confirmer')) + ' <span>&#8594;</span> ' + esc(destination || say('Destination to be confirmed', 'Destination \u00e0 confirmer')) + '</p>');
        if (details.provider) rows.push('<p class="guide-note-line">' + say('Arranged by ', 'Organis\u00e9 par ') + '<strong>' + esc(details.provider) + '</strong>' + (details.vehicle ? ' &middot; ' + esc(details.vehicle) : '') + '</p>');
        if (origin && destination) actions.push('<a class="guide-action-link secondary" href="' + esc(mapsDirectionsUrl(origin, destination)) + '" target="_blank" rel="noopener noreferrer"><span>&#8599;</span>' + say('Get directions', 'Itin\u00e9raire') + '</a>');
      }
      if (booking.type === 'Restaurant' && details.reservationName) rows.push('<p class="guide-note-line">' + say('Reservation under ', 'R\u00e9servation au nom de ') + '<strong>' + esc(details.reservationName) + '</strong></p>');
      if (booking.type === 'Activity' && details.duration) rows.push('<p class="guide-note-line">' + say('Duration: ', 'Dur\u00e9e : ') + '<strong>' + esc(details.duration) + '</strong></p>');
    }
    var when = booking.date ? dateLabel(booking.date, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    if (booking.time) when += (when ? ' &middot; ' : '') + booking.time;
    var mapsQuery = [booking.location, visit.city, visit.country].filter(Boolean).join(', ');
    if (mapsQuery && booking.type !== 'Transportation') actions.push('<a class="guide-action-link" href="' + esc(mapsSearchUrl(mapsQuery)) + '" target="_blank" rel="noopener noreferrer"><span>&#8599;</span>' + say('Open in Google Maps', 'Ouvrir dans Google Maps') + '</a>');
    return (when ? '<p class="guide-when"><span>&#9679;</span>' + esc(when) + '</p>' : '') + '<div class="guide-card-details">' + rows.join('') + '</div>' + (actions.length ? '<div class="guide-card-actions">' + actions.join('') + '</div>' : '');
  }

  function bookingIcon(type) {
    return ({ Flight: '&#9992;', Hotel: '&#8962;', Transportation: '&#8599;', Restaurant: '&#9685;', Activity: '&#10022;' })[type] || '&#10022;';
  }

  function bookingDayKey(booking) {
    if (booking.date) return booking.date;
    if (booking.details && booking.details.checkIn) return booking.details.checkIn;
    if (booking.details && booking.details.segments && booking.details.segments.length) return booking.details.segments[0].date || '';
    return '';
  }
  function guideDayId(key, index) {
    return 'guest-day-' + (key || ('tbd-' + index)).replace(/[^a-z0-9-]/gi, '');
  }

  function buildGuideDayGroups(visit, bookings) {
    var groups = [];
    var start = visit.startDate ? new Date(visit.startDate + 'T12:00:00') : null;
    var end = visit.endDate ? new Date(visit.endDate + 'T12:00:00') : start;
    if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
      var dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      if (dayCount > 0 && dayCount <= 31) {
        for (var dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
          var day = new Date(start.getTime() + dayIndex * 86400000);
          var key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
          groups.push({ key: key, bookings: [] });
        }
      }
    }
    bookings.forEach(function (booking) {
      var key = bookingDayKey(booking);
      var group = groups.find(function (item) { return item.key === key; });
      if (!group) {
        group = { key: key, bookings: [] };
        groups.push(group);
      }
      group.bookings.push(booking);
    });
    return groups.sort(function (a, b) { return (a.key || '9999').localeCompare(b.key || '9999'); });
  }

  function guidePage(found) {
    var visit = found.visit;
    var guest = found.guest;
    if (!visit.travelGuidePublishedAt) return invalidPage();
    var profile = guest.profile || {};
    currentLocale = profile.preferredLanguage === 'French' ? 'fr-CA' : 'en-US';
    var typeNames = currentLocale === 'fr-CA'
      ? { Flight: 'Vol', Hotel: 'H\u00f4tel', Transportation: 'Transport', Restaurant: 'Restaurant', Activity: 'Activit\u00e9' }
      : { Flight: 'Flight', Hotel: 'Hotel', Transportation: 'Transportation', Restaurant: 'Restaurant', Activity: 'Activity' };
    var categoryNames = currentLocale === 'fr-CA'
      ? { Flight: 'Vols', Hotel: 'H\u00f4tels', Transportation: 'Transports', Restaurant: 'Restaurants', Activity: 'Activit\u00e9s' }
      : { Flight: 'Flights', Hotel: 'Hotels', Transportation: 'Transportation', Restaurant: 'Restaurants', Activity: 'Activities' };
    var categoryOrder = ['Flight', 'Hotel', 'Transportation', 'Restaurant', 'Activity'];
    var categoryIcons = { Flight: '&#9992;', Hotel: '&#8962;', Transportation: '&#8599;', Restaurant: '&#9685;', Activity: '&#10022;' };
    var bookings = (visit.bookings || []).filter(function (booking) {
      return (booking.guestIds || []).indexOf(guest.id) >= 0 && booking.status !== 'Cancelled';
    }).sort(function (a, b) { return (bookingDayKey(a) || '9999').localeCompare(bookingDayKey(b) || '9999') || categoryOrder.indexOf(a.type) - categoryOrder.indexOf(b.type); });
    var groups = buildGuideDayGroups(visit, bookings);
    var travelNote = profile.travelMode === 'Car'
      ? '<div class="guide-driving-note"><span class="guide-note-icon">&#8599;</span><div><strong>' + say('Arriving by car', 'Vous venez en voiture') + '</strong><span>' + say('We have noted that you are driving. Parking and arrival details will appear here when available.', 'Votre venue en voiture est not\u00e9e. Les renseignements sur le stationnement seront ajout\u00e9s ici.') + '</span></div></div>'
      : '';
    var dayNav = groups.length ? '<nav class="guide-day-nav" aria-label="' + say('Jump to a day', 'Acc\u00e9der \u00e0 une journ\u00e9e') + '"><span class="guide-day-nav-label">' + say('YOUR DAYS', 'VOS JOURN\u00c9ES') + '</span>' + groups.map(function (group, index) {
      var date = group.key ? dateLabel(group.key, { weekday: 'short', month: 'short', day: 'numeric' }) : say('TBD', '\u00c0 confirmer');
      return '<a class="guide-day-chip" href="#' + guideDayId(group.key, index) + '"><small>' + say('DAY ', 'JOUR ') + (index + 1) + '</small><strong>' + esc(date) + '</strong></a>';
    }).join('') + '</nav>' : '';
    var dayCards = groups.length ? groups.map(function (group, index) {
      var date = group.key ? dateLabel(group.key, { weekday: 'long', month: 'long', day: 'numeric' }) : say('Time to be confirmed', 'Horaire \u00e0 confirmer');
      var categorySections = categoryOrder.map(function (type) {
        var items = group.bookings.filter(function (booking) { return booking.type === type; });
        if (!items.length) return '';
        var cards = items.map(function (booking) {
          return '<article class="guide-booking guide-booking-' + esc(booking.type.toLowerCase()) + '"><div class="guide-booking-head"><span class="guide-booking-icon">' + (categoryIcons[booking.type] || '&#10022;') + '</span><div><span class="guide-booking-type">' + esc(typeNames[booking.type] || booking.type) + '</span><h4>' + esc(booking.name || booking.type) + '</h4></div></div>' + bookingDetails(booking, guest, visit) + '</article>';
        }).join('');
        return '<section class="guide-category-group"><div class="guide-category-heading"><span>' + (categoryIcons[type] || '&#10022;') + '</span><h3>' + esc(categoryNames[type]) + '</h3><small>' + items.length + '</small></div><div class="guide-day-bookings">' + cards + '</div></section>';
      }).join('');
      var empty = !group.bookings.length ? '<div class="guide-day-empty"><span>&#10022;</span><div><strong>' + say('Nothing scheduled yet', 'Rien de pr&eacute;vu pour le moment') + '</strong><small>' + say('Your host may add plans as details are confirmed.', 'L&rsquo;&eacute;quipe pourra ajouter des d&eacute;tails au fur et &agrave; mesure qu&rsquo;ils seront confirm&eacute;s.') + '</small></div></div>' : '';
      return '<section class="guide-day" id="' + guideDayId(group.key, index) + '"><div class="guide-day-heading"><span class="guide-day-index">' + say('DAY ', 'JOUR ') + (index + 1) + '</span><div><h2>' + esc(date) + '</h2><small>' + group.bookings.length + ' ' + say(group.bookings.length === 1 ? 'plan' : 'plans', group.bookings.length === 1 ? 'activit\u00e9' : 'activit\u00e9s') + '</small></div></div><div class="guide-day-content">' + (categorySections || empty) + '</div></section>';
    }).join('') : '<div class="guest-wait-note"><strong>' + say('Your itinerary is being finalized.', 'Votre programme est en pr\u00e9paration.') + '</strong><span>' + say('Check this guide again closer to your visit.', 'Consultez de nouveau ce guide \u00e0 l\u2019approche de votre visite.') + '</span></div>';
    var destination = [visit.city, visit.country].filter(Boolean).join(', ');
    var destinationQuery = destination || visit.name;
    var mapsUrl = mapsSearchUrl(destinationQuery);
    var travelMode = profile.travelMode === 'Car' ? say('Arriving by car', 'Arriv\u00e9e en voiture') : profile.travelMode === 'Other' ? say('Travel details', 'Votre trajet') : say('Arriving by air', 'Arriv\u00e9e en avion');
    var dateSummary = visit.startDate && visit.endDate && visit.startDate !== visit.endDate
      ? dateLabel(visit.startDate, { month: 'short', day: 'numeric' }) + ' - ' + dateLabel(visit.endDate, { month: 'short', day: 'numeric', year: 'numeric' })
      : dateLabel(visit.startDate || visit.endDate, { month: 'short', day: 'numeric', year: 'numeric' });
    renderShell('<section class="guest-guide-hero"><img class="guide-hero-photo" src="guest-guide-cover.jpg" alt="" aria-hidden="true"><div class="guide-hero-copy"><p class="eyebrow">' + say('AXIS LIGHTING PRESENTS', 'AXIS LIGHTING VOUS ACCUEILLE') + '</p><h1>' + esc(visit.city || visit.name) + '</h1><p class="guide-hero-subtitle">' + esc(visit.name) + '</p><div class="guide-hero-meta"><span>&#9679; ' + esc(destination || say('Destination to be confirmed', 'Destination \u00e0 confirmer')) + '</span><span>' + esc(dateSummary) + '</span></div><div class="guide-hero-actions"><a class="guide-hero-map" href="' + esc(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + say('Explore the destination', 'Voir la destination') + ' <span>&#8599;</span></a></div></div><div class="guide-hero-ticket"><span class="guide-ticket-label">' + say('YOUR AXIS VISIT', 'VOTRE VISITE AXIS') + '</span><div class="guide-ticket-avatar">' + esc((guest.profile && guest.profile.preferredName || guest.firstName || 'G').slice(0, 1).toUpperCase()) + '</div><strong>' + esc(guest.profile && guest.profile.preferredName || guest.firstName) + '</strong><span>' + esc(travelMode) + '</span><i></i><small>' + esc(dateSummary) + '</small></div><div class="guide-hero-orbit" aria-hidden="true"></div></section>' +
      '<section class="guide-trip-summary"><div><span class="guide-summary-icon">&#9719;</span><small>' + say('DATES', 'DATES') + '</small><strong>' + esc(dateSummary) + '</strong></div><div><span class="guide-summary-icon">&#9679;</span><small>' + say('DESTINATION', 'DESTINATION') + '</small><strong>' + esc(destination || say('To be confirmed', '\u00c0 confirmer')) + '</strong></div><div><span class="guide-summary-icon">&#8599;</span><small>' + say('GETTING THERE', 'VOTRE TRAJET') + '</small><strong>' + esc(travelMode) + '</strong></div></section>' +
      '<section class="guest-guide-section guide-itinerary-section"><div class="guide-section-heading"><div><p class="eyebrow">' + say('YOUR PERSONAL ITINERARY', 'VOTRE PROGRAMME PERSONNEL') + '</p><h2>' + say('The trip, at a glance', 'Votre voyage en un coup d\u2019\u0153il') + '</h2><p>' + say('Everything arranged for your visit, all in one place.', 'Les d\u00e9tails organis\u00e9s pour votre visite, r\u00e9unis ici.') + '</p></div><span class="guide-itinerary-count">' + groups.length + ' ' + say(groups.length === 1 ? 'day' : 'days', groups.length === 1 ? 'journee' : 'journees') + '</span></div>' + travelNote + dayNav + '<div class="guide-timeline">' + dayCards + '</div></section>' +
      '<section class="guide-help-card"><div class="guide-help-mark">&#10022;</div><div><p class="eyebrow">' + say('WE ARE HERE TO HELP', 'NOUS SOMMES L\u00c0 POUR VOUS') + '</p><h2>' + say('Enjoy your time with Axis.', 'Profitez pleinement de votre visite chez Axis.') + '</h2><p>' + say('For changes or questions about your plans, contact your Axis representative.', 'Pour toute question sur votre programme, contactez votre repr\u00e9sentant Axis.') + '</p></div><a href="' + esc(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + say('Open destination map', 'Ouvrir la carte') + ' &#8599;</a></section>');
  }
  function fmtRange(start, end) {
    if (!start && !end) return 'Dates to be confirmed';
    if (start && end) return dateLabel(start) + ' – ' + dateLabel(end);
    return dateLabel(start || end);
  }

  function boot() {
    var formToken = params.get('form');
    var guideToken = params.get('guide');
    if (params.get('demo') !== 'guest' && !formToken && !guideToken) return false;
    if (!formToken && !guideToken) {
      invalidPage();
      return true;
    }
    var state = readState();
    if (!state) {
      invalidPage();
      return true;
    }
    var found = findGuest(state, formToken || guideToken, formToken ? 'formToken' : 'guideToken');
    if (!found) {
      invalidPage();
      return true;
    }
    found.state = state;
    if (formToken) {
      if (found.guest.formStatus === 'complete') thanksPage(found);
      else profileForm(found);
    } else {
      guidePage(found);
    }
    return true;
  }

  window.AxisGuestPortal = { boot: boot };
})();
