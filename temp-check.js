
    let programmeData = null;
    let schedules = [];
    let isSubmitting = false;

    // Load programme settings
    async function loadProgramme() {
        try {
            const res = await fetch(apiUrl('/api/tuition/programme'));
            const data = await res.json();
            if (data.success) {
                programmeData = data.programme;
                schedules = data.schedules || [];
                updateProgrammeDisplay(data);
            }
        } catch(e) {
            console.log('Using default programme data');
        }
    }

    function updateProgrammeDisplay(data) {
        // Hide hero if settings say not to show it
        if (!data.showHomepageAdvert) return;

        // Update schedule section
        if (schedules.length > 0) {
            const section = document.getElementById('scheduleSection');
            const select = document.getElementById('schedulePreference');
            select.innerHTML = '<option value="">-- No preference --</option>';
            schedules.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.label;
                select.appendChild(opt);
            });
            section.style.display = 'block';
        }

        // Update summary card
        const summary = document.querySelector('.summary-card');
        summary.innerHTML =
            '<div class="summary-row"><span class="label">Programme</span><span class="value">' + (data.programme.title || 'Computer Studies Holiday Tuition') + '</span></div>' +
            '<div class="summary-row"><span class="label">Dates</span><span class="value">' + (data.programme.startDate || '2 Nov 2026') + ' – ' + (data.programme.endDate || '20 Dec 2026') + '</span></div>' +
            '<div class="summary-row"><span class="label">Venue</span><span class="value">' + (data.programme.venue || 'Changara Star Academy') + '</span></div>' +
            '<div class="summary-row"><span class="label">Tuition fee</span><span class="value fee">' + (data.programme.currency || 'KSh') + ' ' + (data.programme.weeklyFee || 500) + ' per week</span></div>' +
            '<div class="summary-row"><span class="label">Registration fee</span><span class="value free">FREE</span></div>' +
            '<div class="note-box">' +
            'Online registration is FREE. Tuition costs KSh 500 per week. ' +
            'Submitting this form does not guarantee admission. Your application will be reviewed ' +
            'by Changara Star Academy, and the school will contact your parent or guardian with the outcome.' +
            '</div>';
    }

    // Collect learning preferences
    function getLearningPreferences() {
        const prefs = [];
        document.querySelectorAll('input[name="pref"]:checked').forEach(cb => prefs.push(cb.value));
        return prefs;
    }

    // Validation
    function validate() {
        const errors = [];
        if (!document.getElementById('studentName').value.trim()) errors.push('Student name is required.');
        if (!document.getElementById('currentSchool').value.trim()) errors.push('Current school is required.');
        if (!document.getElementById('gradeClass').value.trim()) errors.push('Grade/class is required.');
        if (!document.getElementById('age').value.trim()) errors.push('Age is required.');

        if (!document.getElementById('guardianName').value.trim()) errors.push('Parent/guardian name is required.');
        if (!document.getElementById('guardianPhone').value.trim()) errors.push('Phone number is required.');
        if (!document.getElementById('phoneConfirmed').checked) errors.push('Please confirm the phone number.');

        if (!document.getElementById('consentGiven').checked) errors.push('You must accept the parental consent.');

        // Phone validation
        const phone = document.getElementById('guardianPhone').value.trim();
        if (phone && !isValidKenyanPhone(phone)) errors.push('Please enter a valid Kenyan phone number.');

        const altPhone = document.getElementById('alternativePhone').value.trim();
        if (altPhone && !isValidKenyanPhone(altPhone)) errors.push('Alternative phone number is not valid.');

        // Age validation
        const age = parseInt(document.getElementById('age').value);
        if (age && (isNaN(age) || age < 1 || age > 100)) errors.push('Age must be between 1 and 100.');

        return errors;
    }

    function isValidKenyanPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        return /^(?:\+?(254)|0)(7|1)\d{8}$/.test(phone) ||
               /^(254|0)(7|1)\d{8}$/.test(digits);
    }

    // Submit registration
    async function submitRegistration() {
        if (isSubmitting) return;
        if (!programmeData) return;

        // Check if registration is closed
        const banner = document.getElementById('statusBanner');
        if (banner.style.display !== 'none') return;

        const errors = validate();
        if (errors.length > 0) {
            showError(errors.join('\n'));
            return;
        }

        isSubmitting = true;
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        const formData = {
            studentName: document.getElementById('studentName').value.trim(),
            currentSchool: document.getElementById('currentSchool').value.trim(),
            gradeClass: document.getElementById('gradeClass').value.trim(),
            age: document.getElementById('age').value.trim(),
            computerExperience: document.getElementById('computerExperience').value || null,
            guardianName: document.getElementById('guardianName').value.trim(),
            guardianPhone: document.getElementById('guardianPhone').value.trim(),
            alternativePhone: document.getElementById('alternativePhone').value.trim() || null,
            residence: document.getElementById('residence').value.trim() || null,
            learningPreferences: getLearningPreferences(),
            additionalGoals: document.getElementById('additionalGoals').value.trim() || null,
            schedulePreference: document.getElementById('schedulePreference').value || null,
            consentGiven: document.getElementById('consentGiven').checked
        };

        try {
            const res = await fetch(apiUrl('/api/tuition/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                showConfirmation(data);
            } else {
                showError(data.error || 'Submission failed. Please try again.');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> SUBMIT REGISTRATION';
            }
        } catch(e) {
            showError('Network error. Please check your connection and try again.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> SUBMIT REGISTRATION';
        }
        isSubmitting = false;
    }

    function showError(message) {
        const el = document.getElementById('formError');
        el.textContent = message;
        el.style.display = 'block';
        el.style.background = '#fff5f5';
        el.className = 'error-msg';
        setTimeout(() => { el.style.display = 'none'; }, 8000);
    }

    function showConfirmation(data) {
        document.getElementById('formContainer').style.display = 'none';
        document.getElementById('loadingState').style.display = 'block';

        setTimeout(() => {
            document.getElementById('loadingState').style.display = 'none';
            const container = document.getElementById('formContainer');
            container.innerHTML =
                '<div class="confirmation-card">' +
                '  <div class="confirm-icon"><i class="fas fa-check-circle"></i></div>' +
                '  <div class="confirm-title">Registration Successful!</div>' +
                '  <div class="confirm-ref" id="regNumber">' + data.registrationNumber + '</div>' +
                '  <div class="confirm-detail">' +
                '    <div class="row"><span>Student</span><strong>' + data.studentName + '</strong></div>' +
                '    <div class="row"><span>Status</span><span style="color:#d4a017;font-weight:700;">PENDING REVIEW</span></div>' +
                '    <div class="row"><span>Dates</span><span>' + (data.programme.startDate || '2 Nov 2026') + ' – ' + (data.programme.endDate || '20 Dec 2026') + '</span></div>' +
                '    <div class="row"><span>Venue</span><span>Changara Star Academy</span></div>' +
                '    <div class="row"><span>Weekly tuition</span><span>KSh ' + (data.programme.weeklyFee || 500) + '</span></div>' +
                '    <div class="row"><span>Registration fee</span><span>FREE</span></div>' +
                '  </div>' +
                '  <div class="confirm-message">' +
                '    Thank you for registering with Changara Star Academy. Your Computer Studies Holiday Tuition ' +
                '    application has been received successfully. Your application is pending review. ' +
                '    Please keep your registration reference for future communication. ' +
                '    The school will contact your parent or guardian regarding the application outcome.' +
                '  </div>' +
                '  <div style="display:flex; gap:12px; margin-top:20px;">' +
                '    <button class="btn-submit" onclick="window.print()" style="flex:1;">' +
                '      <i class="fas fa-print"></i> Print Confirmation' +
                '    </button>' +
                '    <button class="btn-secondary" onclick="window.location.href=\'index.html\'" style="flex:1;">' +
                '      <i class="fas fa-home"></i> Back to Home' +
                '    </button>' +
                '  </div>' +
                '</div>';
            container.style.display = 'block';
        }, 800);
    }

    function goBack() {
        window.location.href = 'index.html';
    }

    // Init
    (async function() {
        await loadProgramme();
    })();
