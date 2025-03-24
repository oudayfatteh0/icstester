new Vue({
  el: '#app',
  data: {
    icalUrl: '',
    corsEnabled: true,
    isLoading: false,
    response: null,
    showCorsInfo: false,
    showDebugInfo: false,
    calendar: null,
    icalData: null,
    parsedEvents: [],
    corsExplanation: 'CORS should be enabled when accessing calendars from different domains. ' +
                     'Only disable this if you\'re testing a calendar on the same domain or through a proxy.',
    selectedEvent: {
      title: '',
      start: null,
      end: null,
      allDay: false,
      description: '',
      location: ''
    },
    popoverVisible: false,
    popoverPosition: { top: 0, left: 0 }
  },
  computed: {
    responseClass() {
      if (!this.response) return '';
      return this.response.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800';
    },
    responseMessage() {
      if (!this.response) return '';
      return this.response.valid 
        ? 'Valid iCal file detected!' 
        : 'Invalid iCal file or error occurred.';
    }
  },
  methods: {
    fetchIcal() {
      if (!this.icalUrl) {
        this.response = {
          valid: false,
          error: 'Please enter a URL'
        };
        return;
      }

      this.isLoading = true;
      this.response = null;
      this.icalData = null;
      this.parsedEvents = [];
      
      const fetchOptions = {
        method: 'GET',
        headers: {
          'Accept': 'text/calendar'
        }
      };
      
      // Add CORS mode if enabled
      if (this.corsEnabled) {
        fetchOptions.mode = 'cors';
      } else {
        fetchOptions.mode = 'no-cors';
      }
      
      fetch(this.icalUrl, fetchOptions)
        .then(response => {
          // When CORS is disabled, we can't access response details due to browser security restrictions
          if (!this.corsEnabled && response.type === 'opaque') {
            throw new Error('Cannot validate iCal file with CORS disabled. The response is opaque due to security restrictions. Try enabling CORS mode if the server supports it.');
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.text();
        })
        .then(data => {
          // Basic validation - check if it starts with BEGIN:VCALENDAR
          const isValid = data.trim().startsWith('BEGIN:VCALENDAR');
          this.response = {
            valid: isValid,
            error: isValid ? null : 'The file does not appear to be a valid iCal file'
          };
          
          if (isValid) {
            this.icalData = data;
            // Use setTimeout to ensure DOM is updated
            setTimeout(() => {
              this.initCalendar();
            }, 300); // Longer timeout to ensure DOM is ready
          }
        })
        .catch(error => {
          this.response = {
            valid: false,
            error: error.message
          };
          
          // Add a more friendly explanation for common CORS errors
          if (error.message.includes('CORS') || error.message.includes('opaque') || 
              error.message.includes('cross-origin')) {
            this.response.error += '\n\nCORS issues are common when accessing calendars from different domains. Try these solutions:\n' +
              '1. Enable CORS mode if the server supports it\n' +
              '2. Use a CORS proxy service\n' +
              '3. Contact the calendar provider to allow access from your domain';
          }
        })
        .finally(() => {
          this.isLoading = false;
        });
    },
    
    initCalendar() {
      if (this.calendar) {
        this.calendar.destroy();
      }
      
      const calendarEl = document.getElementById('calendar');
      
      // Parse events and store them for debugging
      this.parsedEvents = this.parseICalToEvents(this.icalData);
      
      // Make sure the calendar element exists before initializing
      if (!calendarEl) {
        console.error('Calendar element not found');
        return;
      }
      
      // Alternative approach: use a simple table to display events
      if (!window.FullCalendar) {
        console.warn('FullCalendar not available, using simple table display');
        this.renderSimpleEventTable(calendarEl);
        return;
      }
      
      // Wait for the next tick to ensure DOM is updated
      setTimeout(() => {
        try {
          // Create calendar with modern configuration
          this.calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: this.parsedEvents,
            height: 'auto',
            eventTimeFormat: {
              hour: '2-digit',
              minute: '2-digit',
              meridiem: 'short'
            },
            eventDisplay: 'block',
            eventColor: '#0ea5e9',
            eventTextColor: '#ffffff',
            dayMaxEvents: true,
            nowIndicator: true,
            weekNumbers: false,
            fixedWeekCount: false,
            showNonCurrentDates: false,
            eventDidMount: (info) => {
              // Add tooltip with description
              if (info.event.extendedProps.description) {
                const tooltip = document.createElement('div');
                tooltip.className = 'event-tooltip';
                tooltip.innerHTML = `
                  <div class="p-2 bg-white rounded-lg shadow-lg border border-gray-200 max-w-xs">
                    <p class="font-medium text-sm">${info.event.title}</p>
                    <p class="text-xs text-gray-600 mt-1">${info.event.extendedProps.description}</p>
                  </div>
                `;
                
                // Create tooltip on hover
                info.el.addEventListener('mouseover', () => {
                  document.body.appendChild(tooltip);
                  const rect = info.el.getBoundingClientRect();
                  tooltip.style.position = 'absolute';
                  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
                  tooltip.style.left = `${rect.left + window.scrollX}px`;
                  tooltip.style.zIndex = 1000;
                });
                
                // Remove tooltip when not hovering
                info.el.addEventListener('mouseout', () => {
                  if (document.body.contains(tooltip)) {
                    document.body.removeChild(tooltip);
                  }
                });
              }
            },
            // Modern date formatting
            titleFormat: { 
              year: 'numeric', 
              month: 'long' 
            },
            // Nicer day header format
            dayHeaderFormat: { 
              weekday: 'short' 
            },
            eventClick: (info) => {
              // Prevent default action (following URL)
              info.jsEvent.preventDefault();
              
              // Store the event data
              this.selectedEvent = {
                title: info.event.title,
                start: info.event.start,
                end: info.event.end,
                allDay: info.event.allDay,
                description: info.event.extendedProps.description || '',
                location: info.event.extendedProps.location || ''
              };
              
              // Calculate position for the popover
              const rect = info.el.getBoundingClientRect();
              this.popoverPosition = {
                top: rect.bottom + window.scrollY + 10, // 10px below the event
                left: rect.left + window.scrollX
              };
              
              // Show the popover
              this.popoverVisible = true;
              
              // Add click outside listener
              this.$nextTick(() => {
                document.addEventListener('click', this.handleClickOutside);
              });
            }
          });
          
          this.calendar.render();
        } catch (error) {
          console.error('Error rendering calendar:', error);
          // Fallback to simple table if calendar fails
          this.renderSimpleEventTable(calendarEl);
        }
      }, 100);
    },

    renderSimpleEventTable(container) {
      // Create a simple HTML table to display events
      container.innerHTML = `
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">All Day</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${this.parsedEvents.map(event => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${event.title || 'Untitled'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${this.formatDate(event.start)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${this.formatDate(event.end)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${event.allDay ? 'Yes' : 'No'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    },

    parseICalToEvents(icalData) {
      // Basic parsing of iCal data to extract events
      const events = [];
      
      // Unfold lines according to RFC 5545
      const unfoldedLines = icalData.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
      
      let currentEvent = null;
      let inEvent = false;
      
      for (let i = 0; i < unfoldedLines.length; i++) {
        const line = unfoldedLines[i].trim();
        
        if (line === 'BEGIN:VEVENT') {
          inEvent = true;
          currentEvent = {
            title: 'Untitled Event',
            start: null,
            end: null,
            allDay: false,
            description: ''
          };
        } else if (line === 'END:VEVENT') {
          inEvent = false;
          if (currentEvent && currentEvent.start) {
            // If no end time is specified, use the start time
            if (!currentEvent.end) {
              currentEvent.end = currentEvent.start;
            }
            events.push(currentEvent);
          }
          currentEvent = null;
        } else if (inEvent) {
          // Handle property:value format with possible parameters
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const fullProperty = line.substring(0, colonIndex);
            const value = line.substring(colonIndex + 1);
            
            // Split property name and parameters
            const semiIndex = fullProperty.indexOf(';');
            const property = semiIndex > 0 ? fullProperty.substring(0, semiIndex) : fullProperty;
            const params = semiIndex > 0 ? this.parseParams(fullProperty.substring(semiIndex + 1)) : {};
            
            switch (property) {
              case 'SUMMARY':
                currentEvent.title = this.decodeValue(value);
                break;
              case 'DESCRIPTION':
                currentEvent.description = this.decodeValue(value);
                break;
              case 'DTSTART':
                currentEvent.start = this.parseICalDate(value, params);
                // Check if it's an all-day event
                if (value.length === 8 || params.VALUE === 'DATE') {
                  currentEvent.allDay = true;
                }
                break;
              case 'DTEND':
                currentEvent.end = this.parseICalDate(value, params);
                break;
              case 'LOCATION':
                currentEvent.location = this.decodeValue(value);
                break;
            }
          }
        }
      }
      
      return events;
    },

    parseParams(paramStr) {
      const params = {};
      const parts = paramStr.split(';');
      
      parts.forEach(part => {
        const equalsIndex = part.indexOf('=');
        if (equalsIndex > 0) {
          const name = part.substring(0, equalsIndex);
          const value = part.substring(equalsIndex + 1);
          params[name] = value;
        }
      });
      
      return params;
    },

    decodeValue(value) {
      // Decode escaped characters according to RFC 5545
      return value
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
    },

    parseICalDate(dateStr, params = {}) {
      if (!dateStr) return null;
      
      // Handle dates with timezone info
      if (dateStr.includes('T') && params.VALUE !== 'DATE') {
        // Format: YYYYMMDDTHHMMSSZ
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        // Check if time part exists
        if (dateStr.length >= 15) {
          const hour = dateStr.substring(9, 11);
          const minute = dateStr.substring(11, 13);
          const second = dateStr.substring(13, 15);
          
          return `${year}-${month}-${day}T${hour}:${minute}:${second}${dateStr.endsWith('Z') ? 'Z' : ''}`;
        } else {
          return `${year}-${month}-${day}`;
        }
      } else {
        // Handle all-day events (date only)
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        return `${year}-${month}-${day}`;
      }
    },
    
    formatDate(dateStr) {
      if (!dateStr) return 'N/A';
      
      try {
        const date = new Date(dateStr);
        return date.toLocaleString();
      } catch (e) {
        return dateStr;
      }
    },

    formatEventDate(start, end, allDay) {
      if (!start) return 'Date not specified';
      
      try {
        const startDate = new Date(start);
        const options = { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric'
        };
        
        if (allDay) {
          // For all-day events
          if (end) {
            const endDate = new Date(end);
            // Check if it's a multi-day event
            if (endDate.toDateString() !== startDate.toDateString()) {
              return `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)} (All day)`;
            }
          }
          return `${startDate.toLocaleDateString(undefined, options)} (All day)`;
        } else {
          // For events with specific times
          const timeOptions = { hour: '2-digit', minute: '2-digit' };
          let result = `${startDate.toLocaleDateString(undefined, options)} at ${startDate.toLocaleTimeString(undefined, timeOptions)}`;
          
          if (end) {
            const endDate = new Date(end);
            // If same day, just show end time
            if (endDate.toDateString() === startDate.toDateString()) {
              result += ` - ${endDate.toLocaleTimeString(undefined, timeOptions)}`;
            } else {
              // If different days, show full end date and time
              result += ` - ${endDate.toLocaleDateString(undefined, options)} at ${endDate.toLocaleTimeString(undefined, timeOptions)}`;
            }
          }
          
          return result;
        }
      } catch (error) {
        return 'Invalid date';
      }
    },

    closePopover() {
      this.popoverVisible = false;
      
      // Reset the selected event
      this.selectedEvent = {
        title: '',
        start: null,
        end: null,
        allDay: false,
        description: '',
        location: ''
      };
    },
    
    handleClickOutside(event) {
      const popover = document.getElementById('event-popover');
      if (popover && !popover.contains(event.target) && this.popoverVisible) {
        // Only close if the click is outside the popover and not on a calendar event
        if (!event.target.closest('.fc-event')) {
          this.closePopover();
        }
      }
    }
  },
  created() {
    // Ensure popover is closed on initialization
    this.popoverVisible = false;
    
    // Remove any existing click handlers to prevent duplicates
    document.removeEventListener('click', this.handleClickOutsidePopover);
    
    // Add a global click handler to close the popover when clicking outside
    this.handleClickOutsidePopover = (event) => {
      // Only process if popover is visible
      if (this.popoverVisible) {
        const popover = document.getElementById('event-popover');
        const calendarEvent = event.target.closest('.fc-event');
        
        // Close popover if clicking outside and not on a calendar event
        if (popover && !popover.contains(event.target) && !calendarEvent) {
          this.closePopover();
        }
      }
    };
    
    document.addEventListener('click', this.handleClickOutsidePopover);
  },
  beforeDestroy() {
    document.removeEventListener('click', this.handleClickOutsidePopover);
  },
  mounted() {
    // Ensure popover is closed on initialization
    this.popoverVisible = false;
    this.selectedEvent = {
      title: '',
      start: null,
      end: null,
      allDay: false,
      description: '',
      location: ''
    };
  }
}); 