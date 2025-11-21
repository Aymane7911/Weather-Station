'use client'

import React, { useState, useEffect } from 'react';
import { Cloud, ArrowRight, LogIn, UserPlus } from 'lucide-react';

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Trigger animations on mount
    const timer = setTimeout(() => setIsLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleGetStarted = () => {
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
      setFadeOut(false);
    }, 300);
  };

  return (
    <div className="min-h-screen w-full overflow-hidden bg-black">
      {/* Background Image */}
      <div 
        className="absolute inset-0 w-full h-full"
        style={{
          backgroundImage: 'url(/WS_FRC.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/70"></div>
      </div>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Top Navigation Bar */}
      <div className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 sm:px-8 py-4 transition-all duration-700 ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}>
        {/* Logo from public folder */}
        <div>
          <img src="/FRC_logo.png" alt="Logo" className="h-25 w-auto brightness-150" />
        </div>

        {/* Auth Buttons */}
        <div className="flex items-center gap-3 sm:gap-4">
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

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-20">
        {/* Logo/Header Area */}
        <div className={`mb-8 transform transition-all duration-1000 ${
          isLoaded && !showInfo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        } ${fadeOut ? 'opacity-0' : ''}`}>
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full shadow-2xl">
              <Cloud className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              WeatherHub
            </h1>
          </div>
        </div>
        {/* Main Content */}
        {!showInfo ? (
          <div className={`text-center max-w-2xl mx-auto transform transition-all duration-500 ${
            isLoaded && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}>
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white mb-6 leading-tight">
              Real-Time Weather
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"> Insights</span>
            </h2>

            <p className={`text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed transform transition-all duration-500 delay-100 ${
              isLoaded && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}>
              Monitor weather stations in real-time, track atmospheric data, and make informed decisions with our advanced weather platform
            </p>

            {/* Get Started Button */}
            <button
              onClick={handleGetStarted}
              className={`inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 transform hover:-translate-y-1 mb-12 ${
                isLoaded && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              } delay-200`}
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Features Grid */}
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-6 transform transition-all duration-500 delay-300 ${
              isLoaded && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}>
              {[
                {  title: 'Live Monitoring', desc: 'Track multiple weather stations' },
                {  title: 'Data Analytics', desc: 'Comprehensive weather insights' },
                {  title: 'Real-Time Updates', desc: 'Instant notifications & alerts' }
              ].map((feature, idx) => (
                <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 hover:bg-white/20 transition-all duration-300">
                  
                  <h3 className="text-white font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-300 text-sm">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Info Section */
          <div className={`text-center max-w-3xl mx-auto transform transition-all duration-500 ${
            showInfo && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
              About <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">WeatherHub</span>
            </h2>

            <div className="space-y-6 text-gray-300 text-lg leading-relaxed mb-12">
              <p>
                WeatherHub is a cutting-edge weather monitoring platform designed for meteorologists, environmental researchers, and weather enthusiasts. Our platform provides seamless integration with multiple weather stations to deliver accurate, real-time atmospheric data.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6">
                  <h3 className="text-cyan-400 font-bold mb-2">Our Mission</h3>
                  <p className="text-sm text-gray-300">Make weather data accessible and actionable for everyone</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6">
                  <h3 className="text-blue-400 font-bold mb-2">Our Vision</h3>
                  <p className="text-sm text-gray-300">Lead the future of weather intelligence and prediction</p>
                </div>
              </div>

              <p>
                Join thousands of users who trust WeatherHub to deliver precise, dependable weather information for climate research, agriculture, aviation, and beyond.
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