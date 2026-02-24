/* ============================================
   Denneen & Company — AI Learning Hub
   Main Application JavaScript
   ============================================ */

(function () {
    'use strict';

    // --- Mobile Menu Toggle ---
    var menuBtn = document.querySelector('.mobile-menu-btn');
    var navLinks = document.querySelector('.nav-links');

    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', function () {
            navLinks.classList.toggle('open');
        });

        // Close menu when a link is clicked
        navLinks.querySelectorAll('.nav-link').forEach(function (link) {
            link.addEventListener('click', function () {
                navLinks.classList.remove('open');
            });
        });
    }

    // --- Accordion ---
    document.querySelectorAll('.accordion-header').forEach(function (header) {
        header.addEventListener('click', function () {
            var item = this.closest('.accordion-item');
            var wasOpen = item.classList.contains('open');

            // Close all in this accordion
            var accordion = item.closest('.accordion');
            if (accordion) {
                accordion.querySelectorAll('.accordion-item').forEach(function (i) {
                    i.classList.remove('open');
                });
            }

            // Toggle the clicked one
            if (!wasOpen) {
                item.classList.add('open');
            }
        });
    });

    // --- Form Tabs ---
    document.querySelectorAll('.form-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            var tabName = this.getAttribute('data-tab');

            // Update active tab
            document.querySelectorAll('.form-tab').forEach(function (t) {
                t.classList.remove('active');
            });
            this.classList.add('active');

            // Show matching panel
            document.querySelectorAll('.form-panel').forEach(function (panel) {
                panel.classList.remove('active');
            });
            var targetPanel = document.getElementById('tab-' + tabName);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            // Hide success message if visible
            var success = document.getElementById('form-success');
            if (success) {
                success.hidden = true;
            }
        });
    });

    // --- Form Submission & Email Notification ---
    var NOTIFY_EMAIL = 'flavia.vacirca@denneen.com';

    document.querySelectorAll('.feedback-form').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();

            var formData = new FormData(this);
            var formType = this.getAttribute('data-type');
            var entries = {};

            formData.forEach(function (value, key) {
                entries[key] = value;
            });

            // Build email body
            var subject = 'AI Learning Hub: New ' + formType;
            var bodyParts = [
                'New submission from the Denneen & Company AI Learning Hub',
                '',
                'Type: ' + formType,
                'Submitted: ' + new Date().toLocaleString(),
                ''
            ];

            Object.keys(entries).forEach(function (key) {
                var label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                bodyParts.push(label + ': ' + entries[key]);
            });

            var body = bodyParts.join('\n');

            // Send via mailto (opens user's email client with pre-filled email)
            var mailtoLink = 'mailto:' + encodeURIComponent(NOTIFY_EMAIL) +
                '?subject=' + encodeURIComponent(subject) +
                '&body=' + encodeURIComponent(body);

            // Save submission to localStorage for record-keeping
            saveSubmission(formType, entries);

            // Open mailto link
            window.location.href = mailtoLink;

            // Show success message
            showFormSuccess();

            // Reset form
            this.reset();
        });
    });

    function saveSubmission(type, data) {
        try {
            var submissions = JSON.parse(localStorage.getItem('dc_ai_hub_submissions') || '[]');
            submissions.push({
                type: type,
                data: data,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('dc_ai_hub_submissions', JSON.stringify(submissions));
        } catch (e) {
            // localStorage not available
        }
    }

    function showFormSuccess() {
        // Hide all form panels
        document.querySelectorAll('.form-panel').forEach(function (panel) {
            panel.classList.remove('active');
        });

        // Show success message
        var success = document.getElementById('form-success');
        if (success) {
            success.hidden = false;
        }
    }

    // "Submit another" button
    var submitAnother = document.getElementById('submit-another');
    if (submitAnother) {
        submitAnother.addEventListener('click', function () {
            var success = document.getElementById('form-success');
            if (success) {
                success.hidden = true;
            }

            // Re-activate first tab
            var firstTab = document.querySelector('.form-tab');
            if (firstTab) {
                firstTab.click();
            }
        });
    }

    // --- Smooth scroll for hash links ---
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href').substring(1);
            var target = document.getElementById(targetId);
            if (target) {
                e.preventDefault();
                var offset = 80;
                var targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });

})();
