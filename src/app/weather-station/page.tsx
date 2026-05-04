'use client'

import React, { useState, useEffect } from 'react';
import { Cloud, Wind, Droplets, Thermometer, Gauge, Brain, TrendingUp, Home } from 'lucide-react';

export default function WeatherStationPage() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Placeholder images - replace these paths with your actual image paths from public folder
  const images = [
    '/weather1.png',
    '/weather2.png',
    '/weather3.jpeg'
  ];

  useEffect(() => {
    setIsLoaded(true);
    
    // Auto-scroll images
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Top Navigation Bar */}
      <div className={`fixed top-0 left-0 right-0 z-20 bg-black/30 backdrop-blur-md border-b border-white/10 transition-all duration-700 ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}>
        <div className="flex items-center justify-between px-6 sm:px-8 py-4">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Taqsai</h1>
          </a>

          {/* Home Button */}
          <a
            href="/"
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300 hover:shadow-lg"
          >
            <Home className="w-5 h-5" />
            <span>Home</span>
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 px-6 sm:px-8 lg:px-16 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-12rem)]">
            {/* Left Side - Text Content */}
            <div className={`space-y-8 transition-all duration-1000 ${
              isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'
            }`}>
              {/* Header */}
              <div>
                <h2 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight">
                  Weather Station
                </h2>
                <div className="h-1 w-24 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full"></div>
              </div>

              {/* Description */}
              <p className="text-xl text-gray-300 leading-relaxed">
                Experience the future of meteorological monitoring with our advanced weather station technology. Combining precision sensors with intelligent analytics to deliver comprehensive atmospheric insights.
              </p>

              {/* Features Section */}
              <div className="space-y-6">
                {/* AI Insights */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                      <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">AI-Powered Insights</h3>
                      <p className="text-gray-300 leading-relaxed">
                        Our machine learning algorithms analyze historical patterns and current conditions to provide accurate forecasts and actionable recommendations. Predict weather trends before they happen with advanced predictive analytics.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Climate Parameters */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">Climate Parameters Monitoring</h3>
                      <p className="text-gray-300 leading-relaxed mb-4">
                        Track essential atmospheric conditions with professional-grade accuracy. Our sensors provide real-time data on all critical weather parameters.
                      </p>
                      
                      {/* Parameter Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 text-gray-200">
                          <Thermometer className="w-5 h-5 text-red-400" />
                          <span>Temperature</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-200">
                          <Droplets className="w-5 h-5 text-blue-400" />
                          <span>Humidity</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-200">
                          <Wind className="w-5 h-5 text-cyan-400" />
                          <span>Wind Speed</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-200">
                          <Gauge className="w-5 h-5 text-purple-400" />
                          <span>Pressure</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-400/30 rounded-2xl p-6">
                <p className="text-gray-200 leading-relaxed">
                  <span className="font-bold text-cyan-400">Professional Grade:</span> Built for meteorologists, researchers, and organizations requiring precision weather data. Our weather stations deliver laboratory-quality measurements in real-world conditions.
                </p>
              </div>
            </div>

            {/* Right Side - Image Carousel */}
            <div className={`relative transition-all duration-1000 delay-300 ${
              isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'
            }`}>
              <div className="relative w-full h-[600px] rounded-3xl overflow-hidden shadow-2xl">
                {/* Image Container */}
                {images.map((image, index) => (
                  <div
                    key={index}
                    className={`absolute inset-0 transition-opacity duration-1000 ${
                      index === currentImageIndex ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <img
                      src={image}
                      alt={`Weather Station ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to gradient if image doesn't exist
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.style.background = 
                            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                        }
                      }}
                    />
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                  </div>
                ))}

                {/* Image Counter */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
                  {images.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === currentImageIndex 
                          ? 'w-8 bg-white' 
                          : 'w-2 bg-white/50 hover:bg-white/75'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-6 -left-6 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}