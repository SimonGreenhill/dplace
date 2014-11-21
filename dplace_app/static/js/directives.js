angular.module('languagePhylogenyDirective', [])
    .directive('languagePhylogeny', function() {
        function link(scope, element, attrs) {
            var constructTree = function(langTree) {
                d3.select("language-phylogeny").html('');
                var newick = Newick.parse(langTree.newick_string);
                var rightAngleDiagonal = function() {
                    function diagonal(diagonalPath) {
                        var source = diagonalPath.source,
                            target = diagonalPath.target,
                            pathData = [source, {x: target.x, y: source.y}, target].map(function(d) { return [d.y, d.x]; });
                        return "M" + pathData[0] + ' ' + pathData[1] + ' ' + pathData[2];
                    }
                    return diagonal;
                }
                
                var w = 700;
                var tree = d3.layout.cluster().children(function(node) { return node.branchset; });
                var nodes = tree(newick);
                var h = nodes.length * 9; //height depends on # of nodes
                
                tree = d3.layout.cluster()
                    .size([h, w])
                    .sort(function comparator(a, b) { return d3.ascending(a.length, b.length); })
                    .children(function(node) { return node.branchset; })
                    .separation(function separation(a, b) { return 8; });
                nodes = tree(newick);
                
                d3.select("language-phylogeny").append("h4")
                    .text(langTree.name);
                    
                var vis = d3.select("language-phylogeny").append("svg:svg")
                    .attr("width", w+300)
                    .attr("height", h+30)
                    .append("svg:g")
                    .attr("transform", "translate(40, 20)");
                    
                var diagonal = rightAngleDiagonal();
                
                nodes.forEach(function(node) {
                    node.rootDist = (node.parent ? node.parent.rootDist : 0) + (node.length || 0);
                });
                var rootDists = nodes.map(function(n) { return n.rootDist; });
                var yscale = d3.scale.linear()
                    .domain([0, d3.max(rootDists)])
                    .range([0, w]);
                nodes.forEach(function(node) {
                    node.y = yscale(node.rootDist);
                });
                
                var links = tree.links(nodes);
                var link = vis.selectAll("path.link")
                    .data(links)
                    .enter().append("svg:path")
                    .attr("class", "link")
                    .attr("d", diagonal)
                    .attr("fill", "none")
                    .attr("stroke", "#ccc")
                    .attr("stroke-width", "4px");
                var node = vis.selectAll("g.node")
                    .data(nodes)
                    .enter().append("svg:g")
                    .attr("transform", function(d) { return "translate(" + d.y + ", "+ d.x + ")"; });
                    
                //keeps track of how many variables are mapped on the tree
                //sometimes variables are searched for, but do not appear on any trees
                var keyCount = 0; 
                
                scope.results.societies.forEach(function(society) {
                    var selected = node.filter(function(d) {
                        return d.name == society.society.iso_code;
                    });
                    
                    //append the circles
                    translate = 0;
                    if (society.variable_coded_values.length > 0) {
                        for (var i = 0; i < society.variable_coded_values.length; i++) {
                            selected.append("svg:circle")
                                .attr("r", 4.5)
                                .attr("stroke", "#000")
                                .attr("stroke-width", "0.5")
                                .attr("transform", "translate("+translate+", 0)")
                                .attr("fill", function(n) {
                                    value = society.variable_coded_values[i].coded_value;
                                    hue = value * 240 / scope.code_ids[society.variable_coded_values[i].variable];
                                    return 'hsl('+hue+',100%, 50%)';
                                });                        
                            translate += 20;
                            if (i >= keyCount) keyCount = i+1;
                        }
                    }
                    
                    if (society.environmental_values.length > 0) {
                        selected.append("svg:circle")
                            .attr("r", 4.5)
                            .attr("stroke", "#000")
                            .attr("stroke-width", "0.5")
                            .attr("transform", "translate("+translate+", 0)")
                            .attr("fill", function(n) {
                                value = society.environmental_values[0].value; //only 1 environmental value at a time so we can search like this
                                hue = value * 240 / scope.range;
                                return 'hsl('+hue+',100%, 50%)';
                            });
                        translate += 20;
                    }
                    
                    //lastly, append the text
                    if (keyCount * 20 != translate) translate = keyCount * 20;
                    if (society.environmental_values.length > 0) translate += 20;
                        selected.append("svg:text") 
                            .attr("dx", translate-10)
                            .attr("dy", 4)
                            .attr("font-size", "14px")
                            .attr("font-family", "Arial")
                            .text(function(d) { return d.name; });  
                });
                
                if (scope.query.environmental_filters) {
                    if (translate == keyCount * 20) translate += 20;
                    d3.select("language-phylogeny").select("svg").append("svg:text")
                        .attr("dx", w+15+translate)
                        .attr("dy", 20)
                        .text("E1");
                }
                
                if (scope.query.variable_codes) {
                    keysWritten = 0;
                    translate = 15;
                    for (var key in scope.code_ids) {
                        while (keysWritten < keyCount) {
                            d3.select("language-phylogeny").select("svg").append("svg:text")
                                .attr("dx", w+15+translate)
                                .attr("dy", 20)
                                .text("C"+(keysWritten+1));
                            keysWritten++;
                            translate += 20;
                               
                        }
                    }
                }
                
            };
        
        
            scope.$on('treeSelected', function(event, args) {
                    constructTree(args.tree);
            });
        }

        return {
            restrict: 'E',
            link: link
        };
    });
    
angular.module('dplaceMapDirective', [])
    .directive('dplaceMap', function(colorMapService) {
        function link(scope, element, attrs) {
            // jVectorMap requires an ID for the element
            // If not present, default to 'mapDiv'
            var mapDivId = scope.mapDivId || 'mapDiv';
            // Not possible to assign default values to bound attributes, so check
            element.append("<div id='" + mapDivId + "' style='width:1140px; height:30rem;'></div>");
            scope.localRegions = [];
            scope.checkDirty = function() {
                return !(angular.equals(scope.localRegions, scope.selectedRegions));
            };
            scope.updatesEnabled = true;
            var hideMap = function(scope) {
                if(angular.isDefined(scope.map)) {
                    scope.map.remove();
                    scope.map = undefined;
                }
            };

            var showMap = function(scope) {
                scope.map = $('#' + mapDivId).vectorMap({
                    map: 'tdwg-level2_mill_en',
                    backgroundColor: 'white',
                    series: {
                        markers: [{
                            attribute: 'fill'
                        }]
                    },
                    regionStyle: {
                      initial: {
                        fill: '#428bca',
                        "fill-opacity": 1,
                        stroke: '#357ebd',
                        "stroke-width": 0,
                        "stroke-opacity": 1
                      },
                      hover: {
                        "fill-opacity": 0.8
                      },
                      selected: {
                        fill: '#113'
                      },
                      selectedHover: {
                      }
                    },
                    onRegionOver: function(e, code) {
                        if(attrs.region) {
                            scope.$apply(function () {
                                scope.region = code;
                            });
                        }
                    },
                    onRegionSelected: function(e, code, isSelected, selectedRegionCodes) {
                        if(scope.updatesEnabled && attrs.selectedRegions) {
                            scope.localRegions = selectedRegionCodes.map(function(code) {
                                return {
                                    code: code,
                                    name: scope.map.getRegionName(code)
                                };
                            });
                            var dirty = scope.checkDirty();
                            if(dirty) {
                                scope.$apply(function() {
                                    scope.selectedRegions = angular.copy(scope.localRegions);
                                });
                            }
                        }
                    },
                    regionsSelectable: true
                }).vectorMap('get','mapObject');

                scope.addMarkers = function() {
                    scope.map.removeAllMarkers();
                    if(!scope.societies) {
                        return;
                    }

                    // get the society IDs
                    var societyIds = scope.societies.map(function(societyResult) {
                        return societyResult.society.id;
                    });

                    scope.societies.forEach(function(societyResult) {
                        var society = societyResult.society;
                        // Add a marker for each point
                        var marker = {latLng: society.location.coordinates.reverse(), name: society.name}
                        scope.map.addMarker(society.id, marker);
                    });

                    // Map IDs to colors
                    var colorMap = colorMapService.generateColorMap(scope.societies, scope.query);
                    scope.map.series.markers[0].setValues(colorMap);
                };

                if(attrs.societies) {
                    // Update markers when societies change
                    scope.$watchCollection('societies', function(oldvalue, newvalue) {
                        scope.addMarkers();
                    });
                }

                if(attrs.selectedRegions) {
                    scope.$watchCollection('selectedRegions', function(oldvalue, newvalue) {
                        var dirty = scope.checkDirty();
                        if(dirty) {
                            // update the local variable first
                            scope.localRegions = angular.copy(scope.selectedRegions);

                            // then update the UI
                            scope.updatesEnabled = false;
                            var regionCodes = scope.localRegions.map(function(region){
                                return region.code;
                            });
                            scope.map.clearSelectedRegions();
                            scope.map.setSelectedRegions(regionCodes);
                            scope.updatesEnabled = true;
                        }
                    });
                }
                scope.$on('$destroy', function() {
                    hideMap(scope);
                });
                scope.map.updateSize();
            };

            // Handle visibility toggle
            // This is necessary for results page where element is in the DOM but not visible.
            var initiallyVisible = false;
            // If we have a bound variable to toggle visibility, watch for changes to it
            if(attrs.visible) {
                // 'visible' attribute was bound in the tag
                // use the scope value and watch for changes
                initiallyVisible = scope.visible;
                scope.$watch('visible', function(oldValue, newValue) {
                    if(scope.visible) {
                        showMap(scope);
                    } else {
                        hideMap(scope);
                    }
                });
            } else {
               // tag does not bind a 'visible' attribute, default to true
                initiallyVisible = true;
            }

            if(initiallyVisible) {
                showMap(scope);
            }
        }

        return {
            restrict: 'E',
            scope: {
                societies: '=',
                region: '=',
                selectedRegions: '=',
                mapDivId: '@',
                visible: '=',
                query: '='
            },
            link: link
        };
    });