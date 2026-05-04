'use client'

import React, { useState, useEffect } from 'react';
import { Cloud, ArrowRight, LogIn, UserPlus, ChevronDown, Phone, Mail, Globe, MapPin, Linkedin } from 'lucide-react';

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [showProductsDropdown, setShowProductsDropdown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showProductsDropdown && !(event.target as HTMLElement).closest('.products-dropdown')) {
        setShowProductsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProductsDropdown]);

  const handleAbout = () => {
    setFadeOut(true);
    setTimeout(() => {
      setShowInfo(true);
      setFadeOut(false);
    }, 300);
  };

  const handleBack = () => {
    setFadeOut(true);
    setTimeout(() => {
      setShowInfo(false);
      setShowContact(false);
      setFadeOut(false);
    }, 300);
  };

  const handleContact = () => {
    setFadeOut(true);
    setTimeout(() => {
      setShowContact(true);
      setShowInfo(false);
      setFadeOut(false);
    }, 300);
  };

  return (
    <div className="min-h-screen w-full overflow-hidden bg-black">
      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => console.error('Video error:', e)}
      >
        <source src="/weather.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/70"></div>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Top Navigation Bar */}
      <div className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 sm:px-8 py-2 transition-all duration-700 ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}>
        {/* Logo with fixed height container */}
        <div className="h-[100px] flex items-center overflow-visible">
  <img src="/Taqsai.png" alt="Taqsai" className="h-[200px] w-auto object-contain" />
</div>

        {/* Navigation Links and Auth Buttons */}
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-6">
            {/* Our Products with Dropdown */}
            <div className="relative products-dropdown">
              <button
                onClick={() => setShowProductsDropdown(!showProductsDropdown)}
                className="flex items-center gap-1 text-white/80 hover:text-white font-semibold transition-colors duration-300"
              >
                Our Products
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showProductsDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Dropdown Menu */}
              {showProductsDropdown && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg shadow-xl overflow-hidden">
                  <a
                    href="/weather-station"
                    className="block px-4 py-3 text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
                  >
                    Weather Station
                  </a>
                  <a
                    href="/air-station"
                    className="block px-4 py-3 text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
                  >
                    Air Station
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={handleAbout}
              className="text-white/80 hover:text-white font-semibold transition-colors duration-300"
            >
              About
            </button>
            <button
              onClick={handleContact}
              className="text-white/80 hover:text-white font-semibold transition-colors duration-300"
            >
              Contact Us
            </button>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <a
              href="/auth/login"
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 text-white font-bold py-2 px-4 sm:px-6 rounded-lg transition-all duration-300 hover:shadow-lg"
            >
              <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Login</span>
            </a>

            <a
              href="/auth/register"
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-2 px-4 sm:px-6 rounded-lg shadow-lg hover:shadow-cyan-500/50 transition-all duration-300"
            >
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Register</span>
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-20">
        {/* Main Content */}
        {!showInfo && !showContact ? (
          <div className={`text-center max-w-4xl mx-auto transform transition-all duration-500 ${
            isLoaded && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}>
            <h2 className="text-5xl sm:text-6xl lg:text-6xl font-black text-white mb-8 leading-tight">
              Real-Time Weather Insights
            </h2>

            <p className={`text-xl sm:text-2xl lg:text-2xl text-gray-200 mb-8 leading-relaxed font-light transform transition-all duration-500 delay-100 ${
              isLoaded && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}>
              Monitor weather stations in real-time, track atmospheric data, and make informed decisions with our advanced weather platform
            </p>
          </div>
        ) : showContact ? (
          /* Contact Section */
          <div className={`text-center max-w-3xl mx-auto transform transition-all duration-500 ${
            showContact && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
              Get in <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Touch</span>
            </h2>

            <p className="text-gray-300 text-lg mb-12">
              We'd love to hear from you. Reach out through any of the channels below.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              {/* Phone */}
              <a
                href="tel:+97192242566"
                className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 hover:bg-white/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full group-hover:scale-110 transition-transform duration-300">
                    <Phone className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-gray-300">+971 9 224 2566</p>
                  </div>
                </div>
              </a>

              {/* Email */}
              <a
                href="mailto:info@frc.ae"
                className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 hover:bg-white/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-red-500 to-pink-500 rounded-full group-hover:scale-110 transition-transform duration-300">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-gray-300">info@frc.ae</p>
                  </div>
                </div>
              </a>

              {/* Website */}
              <a
                href="https://www.frc.ae"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 hover:bg-white/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full group-hover:scale-110 transition-transform duration-300">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-gray-300">www.frc.ae</p>
                  </div>
                </div>
              </a>

              {/* Location */}
              <a
                href="https://www.google.com/maps/place/Fujairah+Research+Centre/@25.1548133,56.3368909,17z/data=!3m1!4b1!4m6!3m5!1s0x3ef4f9632b3afd69:0xa6de9f298d040ac1!8m2!3d25.1548133!4d56.3394658!16s%2Fg%2F11swvktlnm?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoASAFQAw%3D%3D"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 hover:bg-white/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full group-hover:scale-110 transition-transform duration-300">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-gray-300">Sakamkam, Fujairah, UAE</p>
                  </div>
                </div>
              </a>
            </div>

            {/* LinkedIn - Full Width */}
            <a
              href="https://www.linkedin.com/company/fujairah-research-center/posts/?feedView=all"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 hover:bg-white/20 transition-all duration-300 group mb-8 block"
            >
              <div className="flex items-center justify-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full group-hover:scale-110 transition-transform duration-300">
                  <Linkedin className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-gray-300">Fujairah Research Centre</p>
                </div>
              </div>
            </a>

            {/* Back Button */}
            <button
              onClick={handleBack}
              className="text-white/60 hover:text-white transition-colors underline"
            >
              ← Back
            </button>
          </div>
        ) : (
          /* Info Section */
          <div className={`text-center max-w-3xl mx-auto transform transition-all duration-500 ${
            showInfo && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
              About <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Taqsai</span>
            </h2>

            <div className="space-y-6 text-gray-300 text-lg leading-relaxed mb-12">
              <p>
                Taqsai is a comprehensive environmental monitoring platform that delivers real-time insights into atmospheric conditions and air quality. Our advanced sensor networks combined with AI-powered analytics provide critical data and intelligent predictions for informed decision-making.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6">
                  <h3 className="text-cyan-400 font-bold mb-3">Air Quality Monitoring</h3>
                  <p className="text-sm text-gray-300">Track pollutants, particulate matter, and air quality index in real-time</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6">
                  <h3 className="text-green-400 font-bold mb-3">Climate Parameters</h3>
                  <p className="text-sm text-gray-300">Track temperature, humidity, and wind speed with precision</p>
                </div>
              </div>

              <p>
                Our platform empowers meteorologists, environmental researchers, and organizations to monitor critical weather parameters including temperature, humidity, and wind speed. Leveraging AI insights, Taqsai analyzes patterns and trends to provide predictive analytics and actionable recommendations—all from a single, intuitive dashboard.
              </p>
            </div>

            {/* Back Button */}
            <button
              onClick={handleBack}
              className="text-white/60 hover:text-white transition-colors mb-8 underline"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}